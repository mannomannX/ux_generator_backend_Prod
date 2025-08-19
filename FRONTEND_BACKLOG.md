🚀 Backlog: Das intelligente UX-Flow & Design-Sync-Whiteboard
Projektvision
Dieses Dokument dient als umfassende Spezifikation für das Frontend-Entwicklungsteam. Es beschreibt das gesamte Dashboard und seine Funktionalität auf einer Ebene, die eine eigenständige Implementierung ohne Rückfragen ermöglicht. Die Vision ist ein intuitives, hochperformantes und kollaboratives Tool, das den Workflow von UX-Designern, Produktmanagern und Entwicklern revolutioniert.

Kernprinzipien des Frontends
Der Designer ist der Architekt: Volle Kontrolle über Layout und Flow-Logik.

KI als Partner: Die KI unterstützt proaktiv und reaktiv, ohne den Workflow zu stören.

Visuelle Klarheit: Jede Information ist visuell transparent und kontextbezogen.

Keine Kompromisse bei der Performance: Das System muss auch bei komplexen Flows flüssig und responsiv bleiben.

🥇 EPIC 1: Whiteboard-Leinwand & Interaktion
Ziel: Implementierung der Kernfunktionalität der unendlichen Leinwand und der grundlegenden Interaktionen.

US-1.1: Die unendliche Leinwand

Beschreibung: Als Nutzer möchte ich auf einer unendlichen Leinwand arbeiten, um Flows ohne Einschränkungen zu erstellen.

Visuelle Spezifikation:

Ein unendliches Canvas mit einem dezenten, grauen Raster (16px).

Hintergrundfarbe: Hellgrau im Light Mode, Dunkelgrau im Dark Mode.

Unterstützung für Zoomstufen von 10% bis 400%.

Funktionale Spezifikation:

Zoom: Mausrad-Scroll für Zoom-In/Out. Cmd/Ctrl + Mausrad für feinen Zoom.

Pan: Spacebar + Linksklick + Drag zum Verschieben der Leinwand.

State Management: Der Zoom- und Pan-Zustand wird im lokalen App-State (Zustand) gespeichert, nicht im .uxflow-Format.

Reasoning: Ein unendliches Canvas ist der Industriestandard für Whiteboard-Tools und bietet maximale Flexibilität. Die intuitive Steuerung über Maus und Tastatur ist essenziell für die Akzeptanz.

US-1.2: Node-Grundinteraktionen

Beschreibung: Als Nutzer möchte ich Knoten (Nodes) erstellen, verschieben, bearbeiten und duplizieren können.

Visuelle Spezifikation:

Nodes sind rechteckige Container mit abgerundeten Ecken (8px).

Hover-State: Eine dezente Aufhellung des Nodes.

Active-State: Ein klarer, farbiger Rand um den Node.

Selektion: Mehrere Nodes können per Shift + Klick oder Drag-Selection ausgewählt werden.

Funktionale Spezifikation:

API-Call: Jede Aktion (Verschieben, Erstellen, Löschen) sendet eine atomare Transaktion (ADD_NODE, MOVE_NODE, DELETE_NODE) an das Backend.

Inline Editing: Ein Doppelklick auf einen Node öffnet ein Eingabefeld zur direkten Bearbeitung des Titels (nodes.data.title).

Duplizieren: Cmd/Ctrl + D dupliziert den ausgewählten Node.

Reasoning: Diese Interaktionen müssen flüssig sein, da sie das Fundament der Benutzererfahrung bilden.

US-1.3: Intelligente Layout-Tools

Beschreibung: Als Nutzer möchte ich meine Flows automatisch aufräumen lassen, aber die Kontrolle über strategisch platzierte Nodes behalten.

Visuelle Spezifikation:

Layout-Button: Ein Button Layout optimieren erscheint im Kontextmenü bei Auswahl mehrerer Nodes.

"Anker"-Icon: Ein kleiner Pin (📍) visualisiert den isPinned-Status eines Nodes.

Animation: Layout-Änderungen werden animiert.

Funktionale Spezifikation:

API-Call: Der Layout optimieren-Button sendet einen Befehl an das Backend, das dann eine Reihe von UPDATE_NODE_LAYOUT-Transaktionen erstellt und an den Frontend-Client zurücksendet.

Pinnen: Der isPinned-Status (boolean) wird über einen Toggle-Button im Kontextmenü des Knotens gesteuert.

Reasoning: Dies ist die ideale Symbiose aus manueller Kontrolle und KI-Assistenz.

🥇 EPIC 2: Dynamische Flow-Elemente & Dokumentation
Ziel: Den Screen-Knoten zu einem leistungsstarken Container für detaillierte Informationen und Varianten machen.

US-2.1: Der erweiterbare Screen-Knoten

Beschreibung: Als Nutzer möchte ich die Details und Varianten eines Screens auf einer separaten Ebene visualisieren, ohne den Haupt-Flow zu überladen.

Visuelle Spezifikation:

Side-Panel: Ein Doppelklick auf einen Screen-Knoten öffnet ein schwebendes Side-Panel neben dem Haupt-Flow.

Knoten im Panel: Innerhalb dieses Side-Panels befinden sich kleine quadratische State-Knoten, die verschiedene Varianten (Fehler-State, Lade-State) repräsentieren.

Verbindungen: Die Logik im Panel wird über Edges mit Labels visualisiert.

Funktionale Spezifikation:

Datenmodell: Die Screen-Varianten werden im .uxflow.nodes.data.manifest.variants[]-Array gespeichert.

API-Call: Das Erstellen einer Variante im Side-Panel sendet eine ADD_VARIANT-Transaktion an den Flow Service.

Reasoning: Das Side-Panel löst das Problem der visuellen Komplexität und ermöglicht eine hierarchische Planung.

US-2.2: Intelligenter Condition-Knoten

Beschreibung: Als Nutzer möchte ich dynamische Logiken (wie den ersten Login) in meinem Flow darstellen, ohne unübersichtliche Rauten-Bäume zu erstellen.

Visuelle Spezifikation:

Knotentyp: Eine Raute mit dynamischen Ausgängen, die per Text-Label beschrieben werden (z. B. "Erster Login", "Standard-Login").

Funktionale Spezifikation:

Datenmodell: Das Condition-Node-Objekt hat ein .uxflow.nodes.data.conditions-Array, das die verschiedenen logischen Pfade speichert.

KI-Generierung: Die KI erkennt dynamische Szenarien und erstellt automatisch Condition-Knoten.

Reasoning: Der Condition-Knoten ist eine semantisch korrekte und visuell klare Lösung für dynamische Logik.

🥇 EPIC 3: Figma-Integration & Präsentation
Ziel: Das Tool mit Figma verbinden und eine professionelle Ansicht für die Dokumentation und Präsentation schaffen.

US-3.1: "Flow First" - Screens generieren

Beschreibung: Als Designer möchte ich aus meinem Flow eine Figma-Struktur erstellen, um meine Arbeit zu beginnen.

Visuelle Spezifikation:

Figma-Plugin-UI: Ein Button Screens generieren im Figma-Plugin.

Ergebnis: Eine neue Figma-Seite mit leeren Frames, die sauber nach der Flow-Struktur angeordnet sind.

Funktionale Spezifikation:

API-Call: Das Plugin ruft GET /api/v1/flow/export auf und parst die nodes und frames.

Verknüpfung: Das Plugin erstellt die Frames und speichert die externalComponentId in unserem Editor über eine LINK_FIGMA-Transaktion.

Reasoning: Diese Funktion eliminiert manuelle Arbeit und stellt sicher, dass der Design-Prozess auf einem sauberen Plan aufbaut.

US-3.2: "Design First" - Verbinden & Dokumentieren

Beschreibung: Als Designer möchte ich meine fertigen Designs aus Figma mit dem Flow-Diagramm verknüpfen.

Visuelle Spezifikation:

Checkliste: Eine visuelle Checkliste erscheint in Figma neben dem verknüpften Frame und zeigt den Fortschritt (To-Do, Done) der einzelnen UI-Elemente und Varianten an.

Verbinden-Button: Im Figma-Plugin-UI gibt es einen Button Verbinden & Screenshot, der die Verknüpfung abschließt.

Funktionale Spezifikation:

API-Call: Der Befehl sendet den Screenshot und die uiMetadata (inkl. Checkliste) an unseren Flow Service.

Datenmodell: Das nodes.data.manifest.checklist im .uxflow-Format wird aktualisiert.

Reasoning: Das Tool passt sich dem realen Designer-Workflow an und macht die Dokumentation zu einem integralen, automatisierten Schritt.

US-3.3: "Present-Mode"

Beschreibung: Als Nutzer möchte ich meinen Flow professionell präsentieren und mit Screenshots dokumentieren.

Visuelle Spezifikation:

Ein eigener Modus, der alle Bearbeitungswerkzeuge ausblendet.

Nodes zeigen eine Vorschau der verknüpften Figma-Screenshots.

Eine Detailansicht öffnet sich bei Klick auf einen Screen, in der man Anmerkungen (Pfeile, Text) direkt auf dem Screenshot platzieren kann.

Funktionale Spezifikation:

Datenmodell: Der Screenshot wird als screenshotUrl im nodes.data.uiMetadata-Objekt gespeichert. Anmerkungen werden als Array von Objekten im selben Feld gespeichert.

Reasoning: Das Tool wird von einem Zeichenbrett zu einem professionellen Präsentations- und Dokumentationswerkzeug.

🥇 EPIC 4: Kollaboration & Transparenz
Ziel: Ein reibungsloses, kollaboratives Erlebnis mit vollständiger Transparenz über alle Änderungen.

US-4.1: Echtzeit-Kollaboration

Beschreibung: Als Nutzer möchte ich sehen, wo andere Teammitglieder arbeiten und deren Änderungen in Echtzeit sehen.

Visuelle Spezifikation:

Live-Cursor: Jeder Nutzer hat einen eindeutigen, farbigen Cursor mit seinem Avatar.

Hervorhebung: Änderungen an Nodes werden durch einen farbigen Rahmen am Node visualisiert.

Funktionale Spezifikation:

WebSocket: Über das API Gateway wird der cursor_position-Event in Echtzeit an alle Nutzer gesendet.

Backend-Logik: Jede Transaktion (UPDATE_NODE, etc.) enthält die userId, die vom Flow Service an das API Gateway zurückgesendet wird, um die visuelle Hervorhebung auszulösen.

Reasoning: Live-Kollaboration schafft Vertrauen und Effizienz im Team.

US-4.2: Kommentarsystem & Versionierung

Beschreibung: Als Nutzer möchte ich Kommentare an Flow-Elementen anheften und die Versionsgeschichte visuell verfolgen.

Visuelle Spezifikation:

Kommentar-Pins: Kleine, schwebende Icons an Nodes oder Edges. Ein Klick öffnet den Kommentar-Thread in der Sidebar.

Versionsansicht: Ein Panel zeigt die Versionshistorie an.

Funktionale Spezifikation:

Datenmodell: Kommentare werden im comments[]-Array des .uxflow-Objekts gespeichert.

API-Call: Der Befehl ADD_COMMENT erstellt einen neuen Kommentar.

Reasoning: Kommentare und Versionierung sind für die Dokumentation von Entscheidungen und die Nachvollziehbarkeit entscheidend.

🥇 EPIC 5: KI-Assistenz & Smart-Features
Ziel: Die KI als intelligente, unaufdringliche Assistenz integrieren, die den Workflow beschleunigt.

US-5.1: Der "Ghost-Editor" für KI-Vorschläge

Beschreibung: Als Nutzer möchte ich KI-Vorschläge als interaktive "Geister"-Elemente auf der Leinwand sehen, die ich anpassen kann, bevor sie permanent werden.

Visuelle Spezifikation:

Geister-Elemente: Halbtransparente Nodes und Edges, die mit einem "Glow"-Effekt hervorgehoben sind.

Funktionale Spezifikation:

API-Workflow: Die KI sendet ein PROPOSAL-Event. Die Frontend-Logik im Monorepo ist so aufgebaut, dass diese Daten verarbeitet und als temporäre Elemente gerendert werden, die noch nicht im Zustand gespeichert sind.

Interaktion: Der Nutzer kann diese Geister-Elemente per Drag & Drop verschieben oder bearbeiten.

Bestätigung: Ein APPLY_PROPOSAL-Befehl sendet den finalen Zustand an das Backend.

Reasoning: Dies ist die ideale KI-Interaktion: Sie macht Vorschläge, aber der Nutzer hat die letzte Entscheidung und die volle Kontrolle.

Fazit & Nächste Schritte
Dieses Dokument ist eine vollständige Spezifikation für das Frontend-Dashboard. Es deckt alle besprochenen Features ab und beschreibt sowohl das visuelle Design als auch die funktionale Logik.

Nächste Schritte für das Entwicklungsteam:

Monorepo-Setup: Beginnen Sie mit der Einrichtung des Monorepos und der gemeinsamen Code-Basis.

Datenmodell-Implementierung: Implementieren Sie das .uxflow v3.0-Datenmodell in MongoDB.

Frontend-Rendering: Starten Sie mit der Implementierung der unendlichen Leinwand und der grundlegenden Nodes.

API-Integration: Implementieren Sie die API Gateway-Endpunkte, um die Kommunikation zwischen Frontend und Backend zu ermöglichen.

Figma-Plugin: Beginnen Sie mit der Entwicklung des Figma-Plugins, das die neuen Workflows "Scaffold" und "Connect" unterstützt.