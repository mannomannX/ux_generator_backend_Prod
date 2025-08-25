---
Absolut, die Entwicklung eines intelligenten Auto-Layout-Algorithmus ist der entscheidende nächste Schritt. Er muss komplex genug sein, um den ästhetischen Ansprüchen von Designern gerecht zu werden, aber auch flexibel genug, um die manuelle Kontrolle zu respektieren.

Hier ist ein detaillierter Entwurf, wie dieser Algorithmus funktionieren sollte, basierend auf all deinen Anforderungen.

---

### **Der Auto-Layout-Algorithmus: Prinzipien und Modi**

Der Algorithmus arbeitet nach dem Grundsatz **"Minimale Änderung, maximale Übersichtlichkeit"**. Er respektiert den manuell vom Nutzer festgelegten Status von Nodes (`isPinned`) und versucht, das beste Layout zu finden, ohne die bestehende Ordnung drastisch zu verändern.

#### **1. Kern-Algorithmus: Die Phasen**

Der Algorithmus durchläuft drei Hauptphasen, die bei jeder Ausführung (KI-Änderung oder manuelles `Layout optimieren`) angewendet werden:

* **Phase 1: Graphen-Analyse & Gruppierung**
    * Der Algorithmus analysiert die ausgewählten Nodes und Edges.
    * Er identifiziert zusammenhängende Teilgraphen (Connected Components). Dies ist entscheidend, um zu verhindern, dass zusammenhangslose Nodes willkürlich verschoben werden.
    * Er erkennt `Frame`-Nodes und alle Nodes, die sich in ihnen befinden. Diese werden als eine Einheit behandelt.
    * Er identifiziert `isPinned`-Nodes als **Ankerpunkte**, die nicht verschoben werden dürfen.

* **Phase 2: Layout-Berechnung**
    * Für jeden zusammenhängenden Teilgraphen wird das Layout auf Basis des ausgewählten Modus (z.B. `vertikal`, `compact`) berechnet.
    * Dabei werden die Positionen der Ankerpunkte (`isPinned`) als feste Koordinaten in die Berechnung einbezogen. Der Algorithmus versucht, das restliche Layout harmonisch um diese Ankerpunkte herum zu gestalten.
    * Ziel ist die Minimierung von Kantenüberschneidungen und die Einhaltung eines definierten Abstands (`padding`) zwischen den Nodes.

* **Phase 3: Positions-Anwendung & Begrenzung**
    * Der Algorithmus berechnet die neuen `position`-Werte für alle **nicht-gepinnten** Nodes.
    * Er wendet eine Dämpfung an, um sicherzustellen, dass die Änderungen begrenzt sind. Das bedeutet, dass ein Node nicht über das gesamte Canvas springt, sondern nur so weit verschoben wird, wie es für das neue Layout nötig ist.

---

### **2. Die Layout-Modi im Detail**

Diese Modi werden vom Nutzer ausgewählt und steuern die Logik des Algorithmus. Sie bieten die Flexibilität, das Layout an den jeweiligen Anwendungsfall anzupassen.

* **Vertikal-Modus (`vertikal`)**
    * **Funktion:** Ordnet die Nodes in einer Top-Down-Hierarchie an.
    * **Anwendung:** Ideal für sequenzielle Workflows wie Registrierungsformulare oder Checkouts.
    * **Algorithmus:** Nutzt einen Algorithmus wie den **Dagre.js- oder ELK-Algorithmus**, der die Nodes in Schichten anordnet und die Kanten übersichtlicher macht. Die `y`-Koordinate der Nodes wird optimiert, während die `x`-Koordinate angepasst wird, um Überschneidungen zu vermeiden.

* **Horizontal-Modus (`horizontal`)**
    * **Funktion:** Ordnet die Nodes in einer Links-Rechts-Hierarchie an.
    * **Anwendung:** Gut für A/B-Testing-Flows oder parallele Pfade.
    * **Algorithmus:** Spiegelt den Vertikal-Modus, optimiert aber die `x`-Koordinate.

* **Kompakt-Modus (`compact`)**
    * **Funktion:** Platziert die Nodes mit minimalem Abstand, um Platz zu sparen.
    * **Anwendung:** Nützlich, wenn das gesamte Diagramm auf einen Blick sichtbar sein soll.
    * **Algorithmus:** Reduziert den `padding`-Parameter auf einen minimalen Wert.

* **Tree-Modus (`tree`)**
    * **Funktion:** Ordnet die Nodes in einer Baumstruktur an, basierend auf ihrer Eltern-Kind-Beziehung.
    * **Anwendung:** Perfekt für hierarchische Strukturen oder komplexe Menü-Flows.
    * **Algorithmus:** Identifiziert Root-Nodes (Nodes ohne eingehende Kanten) und ordnet die anderen Nodes in Ebenen darunter an.

* **Smart-Modus (`smart`)**
    * **Funktion:** Der intelligenteste Modus. Er analysiert die Struktur des Graphen und wählt automatisch den passendsten Layout-Modus aus.
    * **Anwendung:** Standardverhalten für eine schnelle und gute Lösung.
    * **Algorithmus:**
        * Wenn der Graph eine klare sequentielle Struktur hat, wählt er den `vertikal` oder `horizontal`-Modus.
        * Wenn es viele Abzweigungen von einem zentralen Knoten gibt, wählt er den `tree`-Modus.
        * Wenn der Graph aus vielen unzusammenhängenden Elementen besteht, wählt er den `compact`-Modus.
        * Er analysiert auch die bereits vom Nutzer gesetzten Positionen, um den wahrscheinlichsten Modus zu bestimmen.

### **3. Umgang mit Edge-Cases**

* **Zusammenhangslose Nodes:** Der Algorithmus bearbeitet jeden zusammenhängenden Teilgraphen einzeln. Unverbundene Nodes werden nicht willkürlich zu einer Gruppe hinzugefügt. Wenn ein einzelner Node verschoben werden soll, bewegt der Algorithmus diesen nur so weit, wie es nötig ist, um ihn an der optimalen Position innerhalb seiner Umgebung zu platzieren.

* **Begrenzte Änderungen:** Um unerwünschte, große Verschiebungen zu vermeiden, berechnet der Algorithmus die optimale Position und vergleicht sie mit der aktuellen Position. Er wendet die Änderung nur bis zu einem bestimmten Grad an. Das sorgt dafür, dass die ursprüngliche manuelle Anordnung des Nutzers so weit wie möglich erhalten bleibt.

* **Ankerpunkte:** Nodes innerhalb eines `Frame`-Nodes werden als relativ zu diesem Frame behandelt. Der Algorithmus berechnet die Positionen dieser Nodes relativ zum Frame, sodass der Frame als Ganzes verschoben werden kann.

* **Zirkuläre Abhängigkeiten:** Der Algorithmus muss Zirkelbezüge erkennen und behandeln können. In diesem Fall gibt der Algorithmus eine `warning` aus, da zirkuläre Abhängigkeiten in den meisten Layout-Modi zu Problemen führen können. Der Algorithmus versucht, die Kreuze an einer Ecke des Diagramms zu isolieren.