Diese Fragen sind entscheidend, um den Code präzise und nutzerzentriert zu gestalten. Ich werde jede Frage detailliert und mit klaren Entscheidungen beantworten. Die Antworten basieren auf unserer Vision eines professionellen, aber intuitiven Tools, das die Komplexität reduziert und den Workflow priorisiert.

---

### Frontend Canvas Spezifikation

**1. Canvas Behavior**
- **Infinite Canvas**: Ja, die Leinwand soll unendlich sein, wie bei Miro oder FigJam. Das ermöglicht eine flexible und nicht-lineare Planung.
- **Zoom Levels**: Unterstützt werden sollen Zoom-Stufen von **10 % bis 400 %**. Das Frontend sollte die Mausrad-Scrollrichtung umkehren können.
- **Grid Snapping**: Ja, ein **dezentes, sichtbares Raster** ist für das saubere Ausrichten von Nodes essenziell. Die Grid-Größe sollte ca. 16px betragen, mit einer Option, die Einrastfunktion (`snapping`) zu deaktivieren.
- **Pan & Zoom Controls**: `Mausrad` für Zoom, `Space + Linksklick + Drag` für das Panning. Dies ist der Branchenstandard.

**2. Node Interaction**
- **Multi-Select**: Ja, **`Shift` + Linksklick** soll die Mehrfachauswahl von Nodes ermöglichen.
- **Copy/Paste**: Ja, `Cmd/Ctrl + C`, `Cmd/Ctrl + V` und `Cmd/Ctrl + D` (Duplicate) sollen funktionieren.
- **Alignment Tools**: Ja, automatische, dezente Hilfslinien sollen beim Verschieben von Nodes erscheinen, um die Ausrichtung zu erleichtern.
- **Context Menu**: Ja, ein **Rechtsklick-Menü** ist für den Zugriff auf Aktionen wie "Gruppieren", "Duplizieren", "Löschen" und "Knoten pinnen" auf Nodes und die Leinwand notwendig.

**3. Auto-Layout**
- **Layout-Algorithmen**: Wir benötigen einen **Hierarchischen Algorithmus (Top-Down)**, der die logische Struktur des Flows abbildet.
- **Layout-Trigger**: Auto-Layout soll **on-demand** durch einen expliziten Button (`Layout optimieren`) im Kontextmenü ausgelöst werden, nicht automatisch. Dies gibt dem Nutzer die Kontrolle.
- **Layout-Animation**: Ja, Layout-Änderungen sollen sanft **animiert** werden, um den Nutzer nicht zu verwirren und die Übergänge nachvollziehbar zu machen.

---

### **Visual Design & Theme**

**4. Design System**
- **Farbschema**: Wir bevorzugen eine minimalistische, aber moderne Farbpalette. Helle Töne für den Light-Mode, dunkle für den Dark-Mode. Die Farben von **Notion** und **Figma** sind gute Referenzen.
- **Node-Styling**:
    - **Schatten**: Nein, keine Schatten. Wir bevorzugen ein flaches, klares Design.
    - **Border-Radius**: **4px - 8px**, je nach Knotentyp.
    - **Hover/Active States**: Ja, Nodes sollen bei Hover-Events leicht aufleuchten und bei Auswahl einen klaren farbigen Rand bekommen.
- **Edge-Styling**: Wir verwenden **orthogonale Verbindungen**. Sie sind sauberer und leichter zu folgen. Pfeilspitzen sollen ein einfacher, kleiner Pfeil sein.

**5. Canvas Background**
- **Background-Pattern**: Ein **Raster** mit einer geringen Transparenz.
- **Minimap**: Die Minimap befindet sich in einer ausklappbaren Seitenleiste (Sidebar).
- **Toolbar**: Die Toolbar ist als **kontextsensitives, schwebendes Menü** über der Leinwand platziert und passt sich je nach Auswahl an.

---

### **Features & Functionality**

**6. Node Features**
- **Quick Add**: Ja, **`Cmd/Ctrl + K`** soll eine Kommando-Palette öffnen, über die man schnell Knoten erstellen kann.
- **Node Templates**: Wir beginnen mit vordefinierten Knoten-Gruppen als Templates.
- **Node Library**: Ja, eine Drag & Drop-Bibliothek in der Seitenleiste ist ideal.
- **Inline Editing**: Ja, ein **Doppelklick** soll die Bearbeitung von Titel und Beschreibung direkt im Node ermöglichen.

**7. Collaboration Features**
- **Live Cursors**: Ja, Live-Cursor von anderen Nutzern in Echtzeit sind obligatorisch.
- **User Avatars**: Ja, Avatare aktiver Nutzer werden am oberen Rand der Leinwand angezeigt.
- **Comments**: Inline-Pins auf den Nodes, die ein separates Kommentarsystem in der Seitenleiste öffnen.
- **Activity Feed**: Ja, ein Activity-Panel, das die Versionshistorie und Kommentare zusammenführt, ist geplant.

**8. Flow Management**
- **Subflows**: Subflows sollen als **aufklappbare Container** visualisiert werden. Ein Doppelklick auf einen Knoten im Hauptflow öffnet ein Side-Panel, das die Detailansicht mit den Varianten anzeigt.
- **Versioning**: Ein visueller Vergleich ist ein mittelfristiges Ziel.
- **Export**: **PNG, SVG und PDF** sind die wichtigsten Export-Formate.

---

### **Performance & Scale**

**9. Performance Requirements**
Das Canvas soll mindestens **1.000 Nodes** performant handhaben. Wir nutzen **Virtualisierung** und **Progressive Loading**, um die Leistung bei großen Flows zu gewährleisten.

---

### **Integration & Data**

**10. Figma Integration**
- **Preview**: Ja, im **"Present-Mode"** sollen Figma-Screenshots direkt in den Nodes angezeigt werden.
- **Sync-Indicator**: Ein dezentes Icon auf dem Node zeigt an, ob der Screenshot aktuell ist.
- **Quick Actions**: Ja, ein **Rechtsklick auf einen Node** bietet die Möglichkeit, das verknüpfte Figma-Design zu öffnen.

---

### **Mobile & Responsive**

**11. Responsive Behavior**
Die Anwendung soll auf Tablets **les- und editierbar** sein. Auf mobilen Geräten ist sie zunächst nur `read-only`.

**12. Touch-Gesten**: Ja, `Pinch-to-Zoom` und `Two-Finger-Pan` sind obligatorisch.

---

### **Keyboard Shortcuts**

**13. Shortcuts**
Alle genannten Shortcuts sind wichtig und werden implementiert.

---

### **Referenz-Apps**

**14. Inspiration**
- **Flow-Tools**: **Miro** und **Whimsical** für ihre intuitive Bedienung und das saubere Design.
- **SaaS-Design**: **Linear** und **Notion** für ihre minimalistische, aber leistungsstarke UI.
- **Interactions**: **Figma** für seine Präzision und Interaktionen.

---

### **Prioritäten & Spezifische Anforderungen**

**15. MVP vs. Future**
- **Must-Have (MVP)**: Canvas-Editor, basic AI Chat, Live-Cursor, einfaches Figma-Connect, Präsentationsansicht.
- **Nice-to-Have**: Das Kommentarsystem, Versionierung-UI, fortgeschrittene Figma-Features, Persona-Filter.
- **Future**: Ein Template-Marketplace und ein Plugin-SDK.

---

### **Quick Decisions - Final**

1.  **Canvas-Style**: **Infinite Canvas (Miro-like)**
2.  **Node-Connection**: **Drag von Node-zu-Node**
3.  **Primary Action**: **Doppelklick** öffnet das Detail-Panel, Inline-Edit ist ebenfalls über Doppelklick möglich.
4.  **Layout**: **Manuelles Arrangement** ist Standard. Auto-Layout ist ein On-Demand-Werkzeug.
5.  **Theme**: **Beides**, Dark- und Light-Mode, mit der Option, die System-Einstellungen zu verwenden.

---

### **Beispiel-Flows**

- Es gibt keine bestehenden Flows. Wir werden den **"Login-Flow mit Tutorial"** als primäres Beispiel verwenden, um die Funktionalität des `Condition`-Knotens zu testen.
- Die Referenzen **Notion** und **Figma** dienen als Vorlage für das Look and Feel.