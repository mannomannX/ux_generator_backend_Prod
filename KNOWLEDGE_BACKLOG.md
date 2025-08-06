Skizze des Wissensmanagements: Das Gehirn unserer KI
Unser System basiert auf einer fundamentalen Prämisse: Ein brillanter Assistent benötigt zwei Arten von Gedächtnis:

Konversations-Gedächtnis: Er muss sich daran erinnern, was besprochen wurde.

Projekt-Wissen: Er muss verstehen, was der aktuelle Stand des Projekts ist.

Diese beiden Säulen werden von zwei dedizierten Services verwaltet: der ContextEngine und dem KnowledgeAggregator.

🏛️ Säule 1: Die ContextEngine (Das Konversations-Gedächtnis)
Zweck: Dieser Service ist der "Archivar" unserer Dialoge. Seine einzige Aufgabe ist es, den (potenziell sehr langen) Chat-Verlauf aus der MongoDB zu lesen und ihn in ein für die KI verständliches, mehrschichtiges Gedächtnis aufzubereiten.

Das mehrschichtige Gedächtnismodell
Wir fassen den Chat nicht einfach nur zusammen, da dabei kritische Details verloren gehen könnten. Stattdessen strukturieren wir ihn in drei Ebenen:

🧠 Kurzzeitgedächtnis (Sliding Window):

Was es ist: Die letzten 4-6 Nachrichten des Dialogs.

Wie es funktioniert: Diese Nachrichten werden immer wortwörtlich und unverändert bereitgestellt.

Nutzen: Verhindert das "Dementia"-Problem. Der Assistent weiß immer exakt, was er gerade gesagt hat und was du geantwortet hast. Dies ist entscheidend für natürliche Rückfragen und kontextbezogene Antworten.

📖 Mittelzeitgedächtnis (Episodische Zusammenfassungen):

Was es ist: Eine Art "Inhaltsverzeichnis" der bisherigen Konversation.

Wie es funktioniert: Alle 10-15 Nachrichten wird der Summarizer-Agent aufgerufen, um diesen abgeschlossenen Block zu einem "Kapitel" zusammenzufassen (z.B., "Kapitel 1: Der Nutzer hat die Erstellung eines Login-Flows beauftragt und die Implementierung von SSO explizit abgelehnt.").

Nutzen: Gibt der KI einen schnellen Überblick über die wichtigsten Phasen und Entscheidungen der Vergangenheit, ohne den gesamten Verlauf lesen zu müssen. Das hilft, den Fokus zu behalten.

💾 Langzeitgedächtnis (Strukturierte Fakten):

Was es ist: Die absolute, maschinenlesbare Wahrheit des Projekts.

Wie es funktioniert: Nach jeder "Episode" analysiert der KnowledgeExtractor-Agent den Dialog und extrahiert die harten Fakten (z.B. "SSO_implementierung: false") und Entitäten (z.B. {"n_123": "Login Screen"}) in ein strukturiertes JSON-Objekt.

Nutzen: Hier gehen keine Details verloren. Diese Fakten können direkt an Agenten wie den Architekten weitergegeben werden, um absolute Konsistenz zu gewährleisten.

📚 Säule 2: Der KnowledgeAggregator (Das Projekt-Wissen via RAG)
Zweck: Dieser Service ist der "Bibliothekar". Er macht das Wissen, das außerhalb der Konversation liegt – also deine eigentlichen Projektdateien und globales Fachwissen – für die KI durchsuchbar. Er nutzt dafür eine ChromaDB Vektor-Datenbank.

Das mehrschichtige RAG-Modell
Um Datensicherheit und Relevanz zu garantieren, ist das Wissen in drei klar getrennten Ebenen organisiert:

🌍 Ebene 1: Globales Wissen:

Was es ist: Von uns definierte "Fachbücher" wie UX-Heuristiken, Barrierefreiheits-Richtlinien und die .uxflow-Spezifikation.

Für wen: Für alle Nutzer des Systems verfügbar.

Nutzen: Stellt sicher, dass die KI immer auf einer Grundlage von bewährten Best Practices agiert.

🏢 Ebene 2: Workspace-Wissen:

Was es ist: Alle .uxflow-Dateien, wiederverwendbare Komponenten, Personas und Design-System-Regeln, die zu einem spezifischen Team/Workspace gehören.

Für wen: Nur für Mitglieder des jeweiligen Workspaces sichtbar (gefiltert über workspaceId).

Nutzen: Garantiert Team-Konsistenz und ermöglicht es der KI, Vorschläge zu machen, die zum Stil des jeweiligen Projekts passen.

👤 Ebene 3: Nutzer-Wissen:

Was es ist: Gelernte, persönliche Vorlieben und Interaktionsmuster eines einzelnen Nutzers.

Für wen: Nur für den jeweiligen Nutzer sichtbar (gefiltert über userId).

Nutzen: Ermöglicht eine tiefgehende Personalisierung. Das System passt sich an deinen individuellen Arbeitsstil an.



Zusammengefasst:

Der Manager-Agent ist der Einzige, der das volle Konversations-Gedächtnis (ContextEngine) erhält, um den Dialog zu verstehen und strategische Entscheidungen zu treffen.

Die Spezialisten (Planner, UX-Expert etc.) erhalten gezielte Wissens-Ausschnitte aus dem Projekt-Wissen, die exakt auf ihre aktuelle Aufgabe zugeschnitten sind.
Diese Trennung stellt sicher, dass unser System sowohl extrem kontextbewusst als auch hocheffizient arbeitet.