## WICHTIGE INFO ZUM DOKUMENT:

## BASIERT AUF EINER ALTEN ARCHITEKTUR. WEBSOCKET.JS bspw. war darin ein riesiger Monolith, der alles gemacht hat. Es geht also nicht, um die technischen Bezeichnungen der Bestandteile des Codes, sondern die Logik dahinter.




Architektur-Skizze: Das selbstoptimierende Prompt-System (Phase 8.1)
1. Vision & Kernprinzipien
Die Vision: Wir bauen ein System, das nicht nur intelligent ist, sondern auch lernfähig. Es soll aus seinen eigenen Fehlern – insbesondere aus den Korrekturen durch den Nutzer – lernen, um seine eigene Leistung (d.h. die Qualität seiner Prompts) im Laufe der Zeit autonom zu verbessern.

Die Kernprinzipien:

Kontrollierte Autonomie: Die KI darf niemals ihren eigenen operativen Code (die .js-Dateien) direkt ändern. Der Lernprozess generiert Vorschläge, aber die finale Implementierung erfordert einen bewussten, manuellen Schritt durch einen menschlichen Entwickler. Das ist unsere wichtigste Sicherheitsmaßnahme.

Effizienz: Der lernende Prozess wird nicht bei jeder Nachricht ausgelöst, sondern nur bei klar identifizierten "Lernmomenten" (d.h. wenn ein Nutzer einen Vorschlag korrigiert). Das spart Kosten und Rechenleistung.

Mensch-KI-Kollaboration: Das System macht Vorschläge, aber das menschliche Team hat die volle Kontrolle über die Priorisierung und Freigabe dieser Vorschläge. Die KI ist ein Berater, das Team trifft die strategische Entscheidung.

2. Die Architektur des Lern-Zyklus im Überblick
Der gesamte Prozess ist ein geschlossener Kreislauf, der einen Fehler in eine Systemverbesserung umwandelt.

graph TD
    subgraph A[Phase 1: Interaktion & Erkennung]
        A1(Nutzer erhält Plan zur Freigabe) --> A2{Nutzer gibt korrektives Feedback};
        A2 --> A3[State Manager erkennt 'corrective' Sentiment];
        A3 --> A4(State Manager speichert "Lern-Episode");
    end

    subgraph B[Phase 2: Analyse (Hintergrund)]
        A4 --> B1{executeApprovedPlan schließt Episode ab};
        B1 --> B2[Analyst-Agent wird aufgerufen];
        B2 -- "Analysiert Episode" --> B3(Analyst identifiziert Problemursache);
        B3 --> B4[Finding wird in "Problem-DB" gespeichert];
    end

    subgraph C[Phase 3: Menschliche Kuration]
        B4 --> C1[Admin-Interface zeigt neue Findings];
        C1 --> C2{Team bewertet & priorisiert};
        C2 -- "Approve" --> C3[Status in DB -> 'approved'];
        C2 -- "Reject" --> C4[Status in DB -> 'rejected'];
    end

    subgraph D[Phase 4: Automatisierte Lösungsgenerierung]
        C3 --> D1[Prompt-Optimizer-Agent wird getriggert];
        D1 -- "Liest alten Prompt + Problembeschreibung" --> D2(Optimizer generiert neuen Prompt);
        D2 --> D3[Neuer Prompt-Vorschlag wird in DB gespeichert];
    end
    
    subgraph E[Phase 5: Manuelle Implementierung]
        D3 --> E1[Admin-Interface zeigt neuen Prompt-Vorschlag];
        E1 --> E2{Entwickler vergleicht & kopiert Code};
        E2 --> E3[Entwickler committet neuen Prompt ins Git-Repo];
        E3 --> E4(Deployment schließt den Zyklus);
    end

3. Detaillierte technische Umsetzung
3.1 Der Trigger: Die "Lern-Episode"
Was: Ein "Lernmoment" wird ausgelöst, wenn der Classifier-Agent bei einer Antwort auf einen plan_approval-Request das Sentiment "corrective" erkennt.

Wie (websocket.js):

Die revisePlan-Funktion wird aufgerufen. Sie erkennt das corrective-Flag.

Sie erstellt ein learningEpisode-Objekt im dialogueState der WebSocket-Verbindung. Dieses Objekt speichert den originalPlan und das userFeedback.

Nachdem der überarbeitete Plan erfolgreich mit executeApprovedPlan ausgeführt wurde, wird das learningEpisode-Objekt um den successfulPlan ergänzt.

Dieses vollständige Objekt wird dann an den Analysten-Agenten übergeben.

3.2 Der Analyst-Agent (Der Diagnostiker)
Zweck: Findet die Ursache, nicht die Lösung.

Input: Die vollständige "Lern-Episode" als JSON-String.

Prompt (analyst.prompt.js): Der Prompt weist ihn an, die Diskrepanz zwischen dem originalPlan und dem successfulPlan im Licht des userFeedback zu analysieren und die wahrscheinlichste Ursache für den Fehler zu benennen (z.B. "Der Planner hat die Anforderung X missverstanden", "Der Architekt hat keine Kanten generiert").

Output: Ein JSON-Objekt, das in die "Problem-Datenbank" geschrieben wird.

{
  "sourceAgent": "Architekt",
  "detectedProblem": "Der Agent hat verwaiste Knoten erstellt, weil er keine Kanten hinzugefügt hat.",
  "evidence": { /* Das vollständige Lern-Episoden-Objekt */ }
}

3.3 Die "Problem-Datenbank" (prompt_suggestions)
Zweck: Das zentrale Backlog für alle erkannten Systemschwächen.

Technologie: Eine neue Collection in unserer MongoDB.

Schema:

_id: Eindeutige ID

sourceAgent: String (z.B., "Planner", "Architekt")

detectedProblem: String (Die Zusammenfassung des Analysten)

evidence: Object (Die vollständige Lern-Episode)

status: String (new, approved, rejected, implemented)

suggestedPrompt: String (Der vom Optimizer generierte neue Prompt)

createdAt, reviewedAt, implementedAt: Timestamps

3.4 Das Review- & Triage-Interface (Admin-Panel)
Zweck: Die von dir geforderte menschliche Kontrollinstanz.

Backend (admin.js): Benötigt API-Endpunkte, um alle Vorschläge mit dem Status new abzurufen (GET /suggestions) und den Status zu ändern (POST /suggestions/:id/approve).

Frontend (Lovable-Prompt): Eine neue Ansicht, die die Vorschläge anzeigt und dem Team erlaubt, die evidence zu prüfen und die Vorschläge anzunehmen oder abzulehnen.

3.5 Der Prompt-Optimizer-Agent (Der Lösungs-Generator)
Zweck: Erstellt eine konkrete, umsetzbare Lösung.

Trigger: Wird automatisch aufgerufen, wenn ein Vorschlag in der admin.js-Route auf approved gesetzt wird.

Input:

Die detectedProblem-Beschreibung aus der Datenbank.

Der aktuelle Inhalt des "Problem-Prompts" (z.B. der Inhalt der Datei /src/agents/prompts/architect.prompt.js), der zur Laufzeit aus dem Dateisystem gelesen wird.

Prompt (promptOptimizer.prompt.js): Weist ihn an, den alten Prompt basierend auf der Problembeschreibung zu verbessern.

Output: Ein JSON-Objekt {"new_prompt": "..."}. Dieser neue Prompt-String wird im suggestedPrompt-Feld des entsprechenden Dokuments in der Datenbank gespeichert.

3.6 Manuelle Implementierung (Die Sicherheits-Schleuse)
Zweck: Die von dir geforderte, bewusste Hürde, um unkontrollierte Änderungen zu verhindern.

Prozess:

Das Admin-Interface zeigt alle Vorschläge mit dem Status approved und dem suggestedPrompt an.

Ein Entwickler kann den alten und den neuen Prompt vergleichen.

Ein "Kopieren"-Button ermöglicht es, den neuen Prompt-Text in die Zwischenablage zu übernehmen.

Der Entwickler öffnet die entsprechende .js-Datei im Code, fügt den neuen Prompt ein, committet die Änderung und deployt sie.

Optional kann ein "Als implementiert markieren"-Button den Status in der DB auf implemented setzen, um den Zyklus abzuschließen.

Dieser Prozess implementiert deine Vision eines selbstlernenden Systems exakt: Er ist automatisiert, wo es sinnvoll ist, aber behält die volle menschliche Kontrolle an den strategisch entscheidenden Stellen.