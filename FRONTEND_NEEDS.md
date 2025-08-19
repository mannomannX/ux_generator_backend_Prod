

### **Master-Spezifikation: Frontend-Dashboard (v9.0)**

---

### **1. Kernprinzipien**

* **Nutzer ist der Architekt**: Das Frontend muss dem Nutzer die absolute Kontrolle über das Layout geben. Manuelle Änderungen sind immer wichtiger als die KI-Vorschläge.
* **KI ist die intelligente Assistenz**: Die KI-Funktionen sind in die UI integriert, stören aber nie den manuellen Workflow.
* **Visuelle Transparenz**: Jede Änderung, ob von Mensch oder KI, wird dem Nutzer klar und in Echtzeit visualisiert.
* **Performance**: Das Whiteboard muss auch bei Tausenden von Knoten flüssig laufen.
* **Design**: Das Design soll wundervoll, aber im Style von typischen Tools, mit denen man UX-Planen würde, nutzen. Sehr nützliche und durchdachte UI-Struktur sollte inkludiert sein (Nach allen Standards und Ideen)

---

### **2. Das Dashboard-Layout**

Das Dashboard ist in drei Hauptbereiche unterteilt: die Navigation, das Whiteboard und die Seitenleiste.

#### **2.1 Globale Navigation**
Die Navigationsleiste befindet sich oben und enthält:
* **Projektname und Breadcrumbs**: Zeigt den aktuellen Flow-Pfad an (z. B. `Global View > Onboarding`).
* **Kontroll-Buttons**: Aktionen wie "Speichern", "Teilen" oder "Versionierung" sowie ein Button zum Aufruf der `KI-Assistenz`.

#### **2.2 Die unendliche Whiteboard-Leinwand**
Dies ist der zentrale, interaktive Bereich, auf dem die Flows entworfen werden.
* **Rendering**: Eine Canvas-basierte Engine (z. B. React Flow) rendert Nodes und Edges. Die Leinwand ist unendlich und hat ein dezentes Raster zur Ausrichtung.
* **Interaktionen**:
    * **Drag & Drop**: Nodes können verschoben werden.
    * **Zoom & Panning**: Navigieren in der unendlichen Leinwand.
    * **Auswählen**: Einzelne oder mehrere Nodes können per Klick oder Drag-Selection ausgewählt werden.
    * **Kontextmenü**: Ein Rechtsklick auf die Leinwand oder einen Node öffnet ein kontextsensitives Menü.

#### **2.3 Die Seitenleiste (Sidebar)**
Eine einklappbare Leiste am rechten Rand, die je nach Kontext unterschiedliche Funktionen bietet.
* **Standard-Ansicht**: Enthält das `Ebenen-Panel`, die `Mini-Map`, `Filter` und das `Kommentar-System`.
* **KI-Chat**: Ein dediziertes UI-Element, das den Chat mit der KI ermöglicht.
* **Node-Eigenschaften**: Wenn ein Node ausgewählt ist, zeigt die Seitenleiste seine Metadaten und Eigenschaften an, die der Nutzer direkt bearbeiten kann.

---

### **3. Die Whiteboard-Elemente (Visuelle Spezifikation)**

Alle Elemente spiegeln das `.uxflow`-JSON-Format wider und haben eine klare, visuelle Semantik.

#### **3.1 Strukturierende Elemente**
* **Frames**: Große, rechteckige Container mit einem Titel, die zur visuellen Gruppierung von Nodes dienen. Sie sind in der `Mini-Map` und im `Ebenen-Panel` sichtbar. 
* **SubFlowLink-Nodes**: Ein spezieller Knotentyp, der wie ein normaler Knoten aussieht, aber ein Icon hat, das einen Verweis auf einen anderen Frame symbolisiert. Ein Klick darauf führt zu einer sanften Zoom-Animation zum Ziel-Frame.

#### **3.2 Kernknoten (Nodes)**
Alle Knoten haben einen Titel, eine Beschreibung, `position`, `size`, `style`, `personaIds` und `uiMetadata`.
* **Start (`🟢`) & End (`🔴`)**: Runde Knoten, die den Anfang und das Ende eines Flows kennzeichnen.
* **Screen (`⬜`)**: Ein Rechteck mit abgerundeten Ecken, das einen Screen darstellt. Ein Doppelklick auf diesen Knoten öffnet die Detailansicht mit den Screen-Varianten.
* **Decision (`💎`)**: Eine Raute, die eine Entscheidung darstellt.
* **Action (`⚙️`)**: Ein Rechteck, das eine Hintergrundaktion symbolisiert.
* **Note (`🗒️`)**: Ein rechteckiger Notiz-Knoten für informelle Gedanken.

#### **3.3 Spezifische Knoten & Visuelle Konzepte**
* **Condition-Knoten (`< >`)**: Eine Raute mit dynamischen Ausgängen. Beispielsweise nach dem Login-Knoten kann er die Ausgänge "Erster Login", "Standard-Login" haben.
* **Screen-Varianten (`⚡️`)**: Ein Klick auf einen `Screen`-Knoten öffnet ein Side-Panel, das die verschiedenen Zustände (`Lade-State`, `Fehler-State`) visualisiert. Diese Varianten sind kleine, rechteckige Knoten im Panel, die zum Haupt-Screen zurückführen.
* **Pfade (Edges)**: Linien mit Pfeilen. Labels beschreiben die Nutzeraktion. Die Farben der Edges können den Zustand visualisieren (z. B. rot für einen Fehlerpfad).

---

### **4. Interaktive Workflows**

Der Kern des Dashboards sind die reibungslosen, intelligenten Workflows.

#### **4.1 KI-Integration und "Ghost-Modus"**
* **Vorschläge anzeigen**: Wenn der `Cognitive Core` einen `PROPOSAL`-Befehl sendet, rendert das Frontend die vorgeschlagenen Nodes und Edges als halbtransparente "Geister"-Elemente.
* **Manuelle Interaktion**: Der Nutzer kann diese Geister-Elemente direkt verschieben, bearbeiten und mit echten Elementen verknüpfen. Die KI passt das restliche Layout dynamisch an, wenn der Nutzer eine Änderung vornimmt.
* **Anwenden/Verwerfen**: Ein Dialog mit den Optionen **"Anwenden"** (die Geister werden permanent), **"Anpassen"** (weiteres textuelles Feedback an die KI) oder **"Verwerfen"** (die Geister verschwinden) kontrolliert den Prozess.

#### **4.2 Figma-Integration und "Connect"-Workflow**
* **Generieren**: Über unser Figma-Plugin kann der Nutzer einen Flow im Editor auswählen. Das Plugin fragt unser Backend nach der Struktur und generiert in Figma leere Frames mit den korrekten Namen und Maßen.
* **Verbinden & Dokumentieren**: Im Figma-Plugin gibt es eine **Checkliste**, die alle geplanten UI-Elemente und Varianten auflistet. Wenn der Designer einen Frame fertigstellt, klickt er auf **"Verbinden"**. Das Plugin erstellt einen Screenshot, der im `uiMetadata`-Feld des entsprechenden Knotens gespeichert wird.

#### **4.3 "Present-Mode" und Dokumentation**
* **Präsentationsansicht**: Ein separater Modus im Dashboard, der die Bearbeitungswerkzeuge ausblendet. Die `Screen`-Knoten zeigen hier eine Vorschau der verknüpften Figma-Screenshots an. 
* **Detaillierte Ansicht**: Ein Klick auf einen Screen-Knoten im "Present-Mode" öffnet eine größere Ansicht des Screenshots, auf der Pfeile und Anmerkungen platziert werden können, um Interaktionen oder UI-Elemente zu erklären.

---

### **5. Kollaboration & Metadaten**

* **Echtzeit-Kollaboration**: Live-Cursor und Echtzeit-Bearbeitung werden über WebSockets synchronisiert. Änderungen von Teammitgliedern werden durch farbige Rahmen kurz hervorgehoben.
* **Kommentare**: Ein Kommentarsystem mit Threads und `@mentions` ist direkt an Nodes und Edges angeheftet und in der Seitenleiste sichtbar.
* **Persona-Filter**: Die Seitenleiste enthält einen Filter, der das Whiteboard auf Nodes einschränkt, die nur für eine ausgewählte Persona relevant sind.
* **Responsive-Filter**: Ein weiterer Filter in der Seitenleiste erlaubt das Umschalten zwischen der `Desktop`- und `Mobile`-Version des Flows, um die entsprechenden `Screen`-Knoten hervorzuheben.


## Auch hinzuzufügen: ##



Verbleibende Details und Überlegungen
1. Detaillierter Umgang mit der KI
Die Master-Spezifikation beschreibt den "Ghost-Modus" und die Anwendbarkeit der KI-Vorschläge. Was fehlt, sind die spezifischen Befehle (ACTIONS), die die KI nutzt, um das .uxflow-Format zu modifizieren. Wir haben diese in einer früheren Diskussion (als Antwort auf "Welche Commands wollen der AI an die Hand geben...") detailliert besprochen:

Atomare Aktionen: Der Architect Agent muss nur Befehle wie ADD_NODE, UPDATE_NODE_LAYOUT, LINK_FIGMA oder ASSIGN_PERSONA ausführen. Dies ist für das Verständnis des Entwicklerteams essenziell, da es die API-Schnittstelle zum Flow Service definiert.

Präzise Kommunikation: Die KI muss lernen, Aktionen wie DELETE_NODE im Kontext zu kommunizieren, um den Nutzer nicht zu verunsichern. Statt "Ich werde löschen", sollte es heißen "Ich schlage vor, zu ersetzen".

2. UI/UX-Interaktionen im "Present-Mode"
Der "Present-Mode" ist als Präsentationsansicht beschrieben. Es fehlt die genaue Interaktion mit den Anmerkungen (Annotationen) auf den Screenshots.

Detailansicht: Ein Klick auf einen verknüpften Screenshot im "Present-Mode" sollte eine vergrößerte Ansicht öffnen.

Werkzeuge: In dieser Ansicht sollten Werkzeuge wie Pfeile, Hervorhebungen und Textfelder zur Verfügung stehen, um die UI-Interaktionen zu beschreiben.

Speicherung: Diese Anmerkungen werden als Daten (Koordinaten, Typ, Text) im .uxflow.nodes.uiMetadata.annotations-Array gespeichert.

3. Konkrete Umsetzung der Figma-Checkliste
Der Plan für die Figma-Integration beschreibt das Screen-Manifest und die Checkliste. Was fehlt, ist die genaue Spezifikation der Checklisten-Funktionalität.

Status-Synchronisation: Der Status (To-Do, Done) eines Checklisten-Elements im Figma-Plugin muss in Echtzeit an den Editor gesendet und im Flow Service gespeichert werden.

UI im Editor: Der Screen-Knoten im Editor sollte eine visuelle Indikation (z. B. ein Fortschrittsbalken) haben, der den aktuellen Status der Checkliste anzeigt.

4. Umgang mit Edge-Cases im Flow-Diagramm
Wir haben das Konzept des Condition-Knotens eingeführt, um dynamische Logiken (z.B. Erster Login) darzustellen. Dieses neue Konzept wurde in der Master-Spezifikation nicht explizit als Teil des Node-Sets beschrieben.

Neuer Knotentyp: Ein neuer Knotentyp Condition (<>) muss in die Master-Spezifikation aufgenommen werden, der dynamische, benennbare Ausgänge hat und die boolesche Logik (True/False) ersetzt.

5. Versionierung der Figma-Verbindung
Wir haben besprochen, dass das Überschreiben von Screenshots durch den "Verbinden"-Befehl eine Bestätigung ("Bist du sicher?") auslösen soll.

Fehlertoleranz: Bei der LINK_FIGMA-Aktion sollte die API eine Vorschau des alten und des neuen Screenshots liefern, damit der Nutzer die Änderung visuell überprüfen kann, bevor er sie bestätigt.