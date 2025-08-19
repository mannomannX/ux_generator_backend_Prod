# Open Questions - Frontend Canvas Implementation

## Canvas & Interaction Design

### 1. Canvas Behavior
- **Infinite Canvas**: Soll das Canvas unendlich scrollbar sein (wie Miro/FigJam) oder eine feste Größe haben?
- **Zoom Levels**: Welche Zoom-Stufen sollen unterstützt werden? (z.B. 10% - 500%)?
- **Grid Snapping**: Soll es ein sichtbares Grid geben? Welche Grid-Größe bevorzugst du?
- **Pan & Zoom Controls**: Maus-Wheel für Zoom, Space+Drag für Pan, oder andere Kontrollen?

### 2. Node Interaction
- **Multi-Select**: Soll man mehrere Nodes gleichzeitig auswählen können (mit Shift/Cmd)?
- **Copy/Paste**: Sollen Nodes kopiert/dupliziert werden können?
- **Alignment Tools**: Automatische Ausrichtungs-Hilfslinien beim Drag?
- **Context Menu**: Rechtsklick-Menü auf Nodes und Canvas?

### 3. Auto-Layout
- **Layout-Algorithmen**: Welche automatischen Layouts sollen verfügbar sein?
  - Hierarchisch (Top-Down)
  - Horizontal Flow (Links-Rechts)
  - Radial/Circular
  - Force-Directed (Physics-based)
- **Layout-Trigger**: Soll Auto-Layout on-demand oder automatisch erfolgen?
- **Layout-Animation**: Sollen Layout-Änderungen animiert werden?

## Visual Design & Theme

### 4. Design System
- **Farbschema**: Hast du eine bevorzugte Farbpalette oder Beispiel-Apps (Linear, Notion, Figma)?
- **Node-Styling**: 
  - Sollen Nodes Schatten haben?
  - Welche Border-Radius für verschiedene Node-Typen?
  - Hover/Active States?
- **Edge-Styling**:
  - Gerade, gebogene oder orthogonale Verbindungen?
  - Animierte Edges für aktive Flows?
  - Pfeilspitzen-Style?

### 5. Canvas Background
- **Background-Pattern**: Dots, Grid, oder plain?
- **Minimap**: Position (bottom-right, top-right)?
- **Toolbar**: Floating oder fixed? Position?

## Features & Functionality

### 6. Node Features
- **Quick Add**: Soll es eine Suchleiste/Command-Palette geben (Cmd+K)?
- **Node Templates**: Vordefinierte Node-Gruppen als Templates?
- **Node Library**: Drag & Drop aus einer Seitenleiste oder Click-to-Add?
- **Inline Editing**: Doppelklick zum Editieren von Titel/Beschreibung direkt im Node?

### 7. Collaboration Features
- **Live Cursors**: Sollen andere User-Cursor in Echtzeit sichtbar sein?
- **User Avatars**: Wo sollen aktive User angezeigt werden?
- **Comments**: Inline-Comments auf Nodes oder separates Comment-Panel?
- **Activity Feed**: Soll es ein Activity/History Panel geben?

### 8. Flow Management
- **Subflows**: Wie sollen Subflows visuell dargestellt werden?
  - Als kollabierbare Gruppen?
  - Als separate Tabs/Pages?
  - Als Modal/Overlay?
- **Versioning**: Visueller Version-Compare?
- **Export**: Welche Export-Formate sind prioritär (PNG, SVG, PDF)?

## Performance & Scale

### 9. Performance Requirements
- **Max Nodes**: Wie viele Nodes soll das Canvas performant handhaben (100, 1000, 10000)?
- **Virtualization**: Sollen nicht sichtbare Nodes aus dem DOM entfernt werden?
- **Progressive Loading**: Bei großen Flows nur sichtbaren Bereich laden?

## Integration & Data

### 10. Figma Integration
- **Preview**: Sollen Figma-Designs direkt im Node als Thumbnail angezeigt werden?
- **Sync-Indicator**: Visueller Status ob Figma-Design aktuell ist?
- **Quick Actions**: Direkt-Link zu Figma aus dem Node heraus?

## Mobile & Responsive

### 11. Responsive Behavior
- **Mobile View**: Read-only oder auch editierbar auf Tablets?
- **Touch-Gesten**: Pinch-to-Zoom, Two-Finger-Pan?
- **Responsive Breakpoints**: Ab welcher Breite soll zur Mobile-View gewechselt werden?

## Keyboard Shortcuts

### 12. Shortcuts
Welche Keyboard-Shortcuts sind wichtig?
- **Vorschläge**:
  - `Cmd/Ctrl + Z/Y` - Undo/Redo
  - `Delete/Backspace` - Delete selected
  - `Cmd/Ctrl + D` - Duplicate
  - `Cmd/Ctrl + A` - Select all
  - `Cmd/Ctrl + S` - Save
  - `Space` - Pan mode
  - `1-9` - Quick add node types
  - `Cmd/Ctrl + K` - Command palette

## Referenz-Apps

### 13. Inspiration
Welche Apps gefallen dir vom UX/UI her?
- **Flow-Tools**: Whimsical, Lucidchart, Draw.io, Miro, FigJam?
- **SaaS-Design**: Linear, Notion, Stripe Dashboard, Vercel?
- **Interactions**: Figma, Framer, Webflow?

## Prioritäten

### 14. MVP vs. Future
Was ist für den ersten Launch essentiell und was kann später kommen?
- **Must-Have**: ?
- **Nice-to-Have**: ?
- **Future**: ?

## Spezifische Anforderungen

### 15. Besondere Features
- **AI-Integration**: Wie prominent soll die AI-Unterstützung sein?
- **Templates**: Soll es einen Template-Marketplace geben?
- **Plugins**: Erweiterbarkeit durch Plugins geplant?
- **API**: Public API für Integrationen?

---

## Quick Decisions Needed

**Für die sofortige Umsetzung brauche ich Entscheidungen zu:**

1. **Canvas-Style**: Infinite Canvas (Miro-like) oder Fixed viewport?
2. **Node-Connection**: Drag von Node-zu-Node oder Click-Connect?
3. **Primary Action**: Doppelklick öffnet Detail-Panel oder Inline-Edit?
4. **Layout**: Auto-Layout by default oder manuelles Arrangement?
5. **Theme**: Dark mode, Light mode, oder beides?

---

## Beispiel-Flows

Hast du bestehende Flows oder Mockups, die zeigen, wie ein typischer Use-Case aussehen soll?
- Screenshots von gewünschtem Look & Feel?
- Beispiel-Workflows die abgebildet werden sollen?
- Referenz-Designs aus anderen Tools?