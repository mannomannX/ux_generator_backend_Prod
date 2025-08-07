
---

## 🎨 Backlog: Das intelligente UX-Flow & Design-Sync-Whiteboard

### 🥇 Epics & Kern-Workflows

* **EPIC-1: Intuitives Flow-Building & Layout-Management**
* **EPIC-2: Kollaboration, Dokumentation & Transparenz**
* **EPIC-3: Figma-Integration & Design-Sync**
* **EPIC-4: Skalierbarkeit & Performance**
* **EPIC-5: KI-Assistenz & Smart-Features**

---

### 📝 User Stories & Detaillierte Spezifikationen

#### **EPIC-1: Intuitives Flow-Building & Layout-Management**

* **US-1.1: Whiteboard-Grundfunktionalität & Knotentypen**
    * **Beschreibung:** Als Nutzer möchte ich eine unendliche Leinwand nutzen, um schnell und flexibel Flows mit verschiedenen semantischen Knotentypen zu erstellen.
    * **Funktionalität:**
        * **Knoten erstellen/löschen:** Knoten können per Drag & Drop aus einer Sidebar auf die Leinwand gezogen oder über einen Doppelklick auf die Leinwand erstellt werden. Ein Rechtsklick auf einen Knoten bietet die Option zum Löschen oder Duplizieren.
        * **Knotentypen:** Es werden semantische Typen wie **`Start`**, **`End`**, **`Screen`**, **`Popup`**, **`Decision`**, **`Action`**, **`Group`**, **`SubFlowLink`** und **`Note`** unterstützt. Jeder Typ hat eine standardisierte Form (z. B. Raute für Entscheidungen) und ein Icon.
        * **Verbindungen:** Durch Ziehen von der Kante eines Knotens kann eine Verbindung (`Edge`) zu einem anderen Knoten hergestellt werden. Edges können mit einem Label beschriftet werden, um die Nutzeraktion zu beschreiben.
    * **Reasoning:** Dies ist das Fundament des Tools. Durch vordefinierte Knotentypen wird der Flow von Anfang an strukturiert und semantisch korrekt dokumentiert, was die Lesbarkeit für alle Teammitglieder verbessert.

* **US-1.2: Intelligentes Layout-Tool & Pinnen**
    * **Beschreibung:** Als Nutzer möchte ich die KI nutzen, um meine Flows automatisch aufzuräumen, aber die Kontrolle über die Platzierung kritischer Knoten behalten.
    * **Funktionalität:**
        * **"Layout optimieren"**: Ein einziger, kontextsensitiver Befehl im Kontextmenü einer Knotenauswahl. Er analysiert die Verbindungen und wendet das am besten geeignete Layout an (z.B. sequenzielles Layout bei einer klaren Kette von Nodes, Grid-Layout bei unverbundenen Elementen).
        * **"Pinnen"**: Ein Rechtsklick auf einen Knoten bietet die Option **"Als Anker festlegen"**. Der Knoten wird visuell mit einem kleinen Anker-Icon markiert.
        * **Verhalten:** Bei "Layout optimieren" respektiert der Algorithmus die Position aller gepinnten Knoten und ordnet nur die ungepinnten Knoten harmonisch um sie herum an.
    * **Reasoning:** Dies ist die perfekte Balance zwischen KI-Assistenz und manueller Kontrolle. Der Nutzer kann schnell ein chaotisches Diagramm aufräumen, ohne die mühsam platzierten "strategischen" Knoten neu arrangieren zu müssen.

* **US-1.3: Navigation & Organisation in komplexen Flows**
    * **Beschreibung:** Als Nutzer möchte ich auch in großen Projekten mit vielen Knoten und Ebenen die Orientierung behalten.
    * **Funktionalität:**
        * **Frames**: Ein Projekt besteht aus einer **einzigen Datei**, die mehrere **Frames** (Leinwände) enthält. Jeder Frame repräsentiert einen spezifischen Teil-Flow (z. B. "Checkout", "Onboarding").
        * **`SubFlowLink`-Knoten:** Diese speziellen Knoten fungieren als visuelle "Links" zwischen Frames. Ein Klick darauf löst eine sanfte Zoom-und-Schwenk-Animation aus, die den Nutzer zum Ziel-Frame führt.
        * **Breadcrumbs:** Eine Navigationsleiste am oberen Rand zeigt den Pfad (z. B. `Global > Onboarding > Registrierung`) und ermöglicht eine schnelle Rückkehr zu höheren Ebenen.
    * **Reasoning:** Das Frame-Konzept löst das Skalierbarkeitsproblem und macht komplexe, hierarchische Flows übersichtlich und navigierbar.

---

#### **EPIC-2: Kollaboration, Dokumentation & Transparenz**

* **US-2.1: Integriertes Kommentarsystem**
    * **Beschreibung:** Als Nutzer möchte ich direkt im Flow-Diagramm mit meinem Team kommunizieren, ohne ein externes Tool wie Slack oder Jira zu benötigen.
    * **Funktionalität:**
        * **Kommentar-Pins:** An jedem Knoten und jeder Kante können Kommentare angeheftet werden. Sie sind als visuell dezente Pins dargestellt.
        * **Threads & Status:** Kommentare können als Threads geführt werden und einen Status (z. B. "offen", "gelöst") haben.
        * **`@`Mentions & Benachrichtigungen:** Nutzer können Teamkollegen mit `@`-Mentions direkt ansprechen, was eine Benachrichtigung auslöst.
    * **Reasoning:** Die Dokumentation von Entscheidungen und Akzeptanzkriterien findet direkt am Ort der Entstehung statt, was den Kontext bewahrt und Medienbrüche eliminiert.

* **US-2.2: Transparente Kollaboration**
    * **Beschreibung:** Als Nutzer möchte ich jederzeit sehen, wer was im Flow ändert, um Konflikte zu vermeiden und den Überblick zu behalten.
    * **Funktionalität:**
        * **Echtzeit-Hervorhebung:** Jede Änderung (Verschieben, Bearbeiten) eines Knotens durch einen Teamkollegen wird in Echtzeit durch einen farbigen Rahmen (in der Farbe des jeweiligen Nutzers) und einen schwebenden Avatar markiert.
        * **Versionsgeschichte:** Eine lückenlose Historie aller Änderungen (manuell und KI) wird aufgezeichnet. Nutzer können zu jedem früheren Zustand zurückkehren.
    * **Reasoning:** Vertrauen in ein kollaboratives Tool entsteht durch Transparenz. Dies minimiert Editierkonflikte und sorgt für Sicherheit in Unternehmen, die eine lückenlose Dokumentation benötigen.

* **US-2.3: Persona- und Ziel-Filter**
    * **Beschreibung:** Als Nutzer möchte ich meinen Flow aus der Perspektive verschiedener Zielgruppen oder Geschäftsziele visualisieren können.
    * **Funktionalität:**
        * **Metadaten:** Knoten und Kanten können mit IDs von Personas oder Nutzerzielen verknüpft werden.
        * **Filter-Panel:** Eine Sidebar ermöglicht das Filtern des Flows. Wähle ich eine Persona aus, werden nur die Nodes und Edges visuell hervorgehoben oder angezeigt, die für sie relevant sind.
    * **Reasoning:** Dies stellt sicher, dass das Team stets nutzerzentriert arbeitet und strategische Entscheidungen anhand klarer Zielgruppen treffen kann.

---

#### **EPIC-3: Figma-Integration & Design-Sync**

* **US-3.1: "Flow First" - Screens generieren**
    * **Beschreibung:** Als Designer möchte ich meinen strategischen Flow in unserem Editor planen und daraus automatisch die nötige Struktur für meine Arbeit in Figma erstellen.
    * **Funktionalität:**
        * **Figma-Plugin:** Ein Plugin bietet eine Verbindung zu unserer API. Es kann auf die Struktur eines ausgewählten Flows zugreifen.
        * **Scaffolding-Befehl:** Im Plugin wählt der Nutzer einen Flow aus und führt den Befehl **"Screens generieren"** aus. Das Plugin erstellt für jeden `Screen`-Knoten einen leeren Frame in Figma, benennt ihn korrekt und ordnet die Frames sauber an.
        * **Responsive Templates:** Der Nutzer kann ein Geräte-Template im Plugin auswählen, um die Frames in der korrekten Größe zu erstellen.
    * **Reasoning:** Eliminiert manuelle, fehleranfällige Arbeit und stellt sicher, dass die visuelle Umsetzung von Anfang an auf einer sauberen, strategischen Grundlage aufbaut.

* **US-3.2: "Design First" - Verbinden & Dokumentieren**
    * **Beschreibung:** Als Designer möchte ich meine fertigen Designs in Figma einfach mit dem entsprechenden Flow-Diagramm verknüpfen und dokumentieren.
    * **Funktionalität:**
        * **"Verbinden"-Befehl:** Im Plugin wählt der Nutzer einen Figma-Frame aus und klickt auf **"Verbinden"**. Das Plugin erstellt einen hochauflösenden Screenshot und sendet ihn mit Metadaten an unseren Editor, wo er mit dem entsprechenden `Screen`-Knoten verknüpft wird.
        * **Update-Button:** Bei Änderungen im Figma-Frame kann der Nutzer das Plugin öffnen und auf **"Screenshot aktualisieren"** klicken, um die visuelle Dokumentation im Editor auf den neuesten Stand zu bringen.
    * **Reasoning:** Dies schließt die Lücke zwischen Flow-Planung und visueller Umsetzung. Das Flow-Diagramm wird zu einem lebendigen, visuellen Dokumentationswerkzeug.

---

#### **EPIC-4: Skalierbarkeit & Performance**

* **US-4.1: Optimierte Rendering-Engine**
    * **Beschreibung:** Als Nutzer möchte ich auch bei Tausenden von Knoten eine flüssige Bedienung.
    * **Funktionalität:**
        * **Canvas-Rendering:** Die Darstellung erfolgt über eine performante Canvas-Engine, die große Graphen mühelos handhabt.
        * **Virtualisierung:** Es werden nur die Elemente gerendert, die sich im sichtbaren Bereich der Leinwand befinden.
    * **Reasoning:** Performance ist keine Funktion, sondern eine Grundvoraussetzung für die Akzeptanz des Tools in professionellen Umgebungen.

* **US-4.2: Effiziente Datenübertragung**
    * **Beschreibung:** Als Nutzer möchte ich, dass die Zusammenarbeit in Echtzeit ohne Verzögerung funktioniert.
    * **Funktionalität:**
        * **Diff-Patches:** Statt das gesamte JSON-Objekt zu senden, werden nur die vorgenommenen Änderungen als kleine Datenpakete über WebSockets verschickt.
    * **Reasoning:** Reduziert die Latenz bei der Synchronisation in Echtzeit und ermöglicht ein reibungsloses Kollaborationserlebnis.

---

#### **EPIC-5: KI-Assistenz & Smart-Features**

* **US-5.1: Der interaktive KI-Assistent**
    * **Beschreibung:** Als Nutzer möchte ich mit der KI interagieren können, um Flow-Vorschläge zu generieren und zu verfeinern.
    * **Funktionalität:**
        * **"Generieren"-Befehl:** Ein Befehl, der die KI beauftragt, einen Teil-Flow zu generieren (z. B. "Erstelle einen Flow für einen Passwort-vergessen-Prozess").
        * **Interaktiver "Ghost-Modus"**: Die Vorschläge erscheinen als halbtransparente Elemente, die ich direkt manipulieren kann. Die KI passt das restliche Layout dynamisch an, wenn ich meine Änderungen festlege.
    * **Reasoning:** Verwandelt die KI von einem statischen Tool in einen dynamischen Partner, der meine Absichten versteht und sich an meinen Workflow anpasst.

* **US-5.2: "Flow-Check"-Validierung**
    * **Beschreibung:** Als Nutzer möchte ich, dass die KI meinen Flow auf potenzielle Probleme und Best-Practice-Verstöße prüft.
    * **Funktionalität:**
        * Ein Befehl **"Flow überprüfen"** analysiert den Graphen auf Anti-Patterns (z.B. Sackgassen, fehlende Fehlerpfade, redundante Schritte).
        * Die KI gibt visuelles Feedback (z.B. rote Markierungen) und konkrete Verbesserungsvorschläge (z.B. "Füge eine Fehlermeldung nach diesem Schritt hinzu").
    * **Reasoning:** Dies ist der ultimative Mehrwert. Das Tool wird von einem Zeichenprogramm zu einem strategischen Berater, der hilft, die Qualität des Designs schon in der Konzeptionsphase zu sichern.