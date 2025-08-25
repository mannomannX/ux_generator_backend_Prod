# Layout Algorithm Specification

## 🎯 Ziel
Ein deterministischer, kompakter und übersichtlicher Auto-Layout-Algorithmus für UX Flow Diagramme, der in React Flow integriert werden kann.

## 📋 Anforderungen

### 1. **Determinismus**
- Gleicher Input MUSS immer das gleiche Layout produzieren
- Sortierung aller Collections vor Verarbeitung
- Keine zufälligen Werte oder Zeitstempel

### 2. **React Flow Kompatibilität**
- Handle-IDs müssen exakt mit Node-Definitionen übereinstimmen
  - Erlaubt: `"top"`, `"bottom"`, `"left"`, `"right"`
  - NICHT: `"top-0"`, `"bottom-1"`, etc.
- Edges brauchen `sourceHandle` und `targetHandle` Properties
- Nodes brauchen `position: {x, y}` und optional `width`, `height`

### 3. **Hierarchische Anordnung**
- Level-basierte Positionierung (Topologische Sortierung)
- Start-Nodes links/oben (Level 0)
- End-Nodes rechts/unten (höchste Level)
- Gleiche Level = gleiche horizontale/vertikale Position

### 4. **Kompaktheit**
- Minimaler benötigter Platz
- Nodes sollten nicht zu weit auseinander sein
- Aber: Genug Abstand für Lesbarkeit (min. 20px zwischen Nodes)

### 5. **Kollisionsvermeidung**
- Nodes dürfen sich nicht überlappen
- Edges sollten nicht durch Nodes laufen
- Frame-Children müssen innerhalb der Frame bleiben

### 6. **Frame Support**
- Frames sind Container für andere Nodes
- Children mit `parentNode` Property gehören in Frame
- Frame-Größe muss sich an Children anpassen
- Children-Position relativ zur Frame

## 🔧 Algorithmus-Phasen

### Phase 1: Struktur-Analyse
```javascript
// 1. Initialisiere NodeInfo für jeden Node
nodeInfoMap.set(node.id, {
  id: node.id,
  x: 0, y: 0,
  width: node.width || 180,
  height: node.height || 80,
  level: 0,
  rank: 0,
  parent: node.parentNode,
  children: [],
  incoming: [],
  outgoing: []
});

// 2. Baue Adjazenzlisten aus Edges
edges.forEach(edge => {
  sourceInfo.outgoing.push(edge.target);
  targetInfo.incoming.push(edge.source);
});

// 3. Identifiziere Frame-Children
if (node.parentNode) {
  parentInfo.children.push(node.id);
}
```

### Phase 2: Level-Berechnung (Topologische Sortierung)
```javascript
// 1. Finde Start-Nodes (keine incoming edges)
const startNodes = nodes.filter(n => n.incoming.length === 0);

// 2. BFS für Level-Zuweisung
queue = startNodes.map(n => ({id: n.id, level: 0}));
while (queue.length > 0) {
  const {id, level} = queue.shift();
  nodeInfo.level = level;
  
  // Outgoing nodes bekommen level + 1
  nodeInfo.outgoing.forEach(targetId => {
    queue.push({id: targetId, level: level + 1});
  });
}

// 3. Rank-Zuweisung innerhalb jedes Levels
levelGroups.forEach(nodesInLevel => {
  nodesInLevel.sort((a, b) => {
    // Gruppiere nach Parent
    // Dann nach Connections
    // Dann alphabetisch
  });
  nodesInLevel.forEach((node, index) => {
    node.rank = index;
  });
});
```

### Phase 3: Position-Berechnung
```javascript
// Compact Mode Beispiel
nodeInfo.forEach(info => {
  // Skip frame children (werden später positioniert)
  if (info.parent) return;
  
  // Basis-Position
  x = info.level * LEVEL_SPACING;  // z.B. 350px
  y = info.rank * RANK_SPACING;    // z.B. 180px
  
  // Leichtes Staggering für bessere Edge-Sichtbarkeit
  if (info.level % 2 === 1) {
    y += STAGGER_OFFSET;  // z.B. 30px
  }
  
  info.x = x;
  info.y = y;
});
```

### Phase 4: Frame-Handling
```javascript
frames.forEach(frame => {
  const children = frame.children;
  
  if (children.length === 0) {
    // Leere Frame: Minimal-Größe
    frame.width = 250;
    frame.height = 150;
    return;
  }
  
  // 1. Berechne benötigte Frame-Größe
  const totalWidth = sum(children.widths) + gaps;
  const totalHeight = max(children.heights) + padding;
  
  frame.width = Math.max(totalWidth, MIN_FRAME_WIDTH);
  frame.height = Math.max(totalHeight, MIN_FRAME_HEIGHT);
  
  // 2. Positioniere Children innerhalb Frame
  let currentX = frame.x + PADDING;
  let currentY = frame.y + PADDING;
  
  children.forEach(child => {
    child.x = currentX;
    child.y = currentY;
    currentX += child.width + GAP;
  });
});
```

### Phase 5: Kollisions-Adjustierung
```javascript
// Einfache Überlappungs-Korrektur
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    if (nodesOverlap(nodeA, nodeB)) {
      // Verschiebe nodeB minimal
      const overlapX = (nodeA.right - nodeB.left) + MARGIN;
      const overlapY = (nodeA.bottom - nodeB.top) + MARGIN;
      
      if (overlapX < overlapY) {
        nodeB.x += overlapX;
      } else {
        nodeB.y += overlapY;
      }
    }
  }
}
```

### Phase 6: Zentrierung
```javascript
// Verschiebe alle Nodes so dass keine negativen Koordinaten
const minX = Math.min(...nodes.map(n => n.x));
const minY = Math.min(...nodes.map(n => n.y));

if (minX < MARGIN || minY < MARGIN) {
  const offsetX = MARGIN - minX;
  const offsetY = MARGIN - minY;
  
  nodes.forEach(node => {
    node.x += offsetX;
    node.y += offsetY;
  });
}
```

### Phase 7: Edge-Routing
```javascript
edges.forEach(edge => {
  const source = nodes.find(n => n.id === edge.source);
  const target = nodes.find(n => n.id === edge.target);
  
  // Smart Handle Selection basierend auf relativen Positionen
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontale Verbindung
    edge.sourceHandle = dx > 0 ? 'right' : 'left';
    edge.targetHandle = dx > 0 ? 'left' : 'right';
  } else {
    // Vertikale Verbindung
    edge.sourceHandle = dy > 0 ? 'bottom' : 'top';
    edge.targetHandle = dy > 0 ? 'top' : 'bottom';
  }
});
```

## ⚠️ Häufige Fehler

### 1. **Handle-ID Mismatch**
❌ `edge.sourceHandle = "bottom-0"`
✅ `edge.sourceHandle = "bottom"`

### 2. **Negative Koordinaten**
❌ Nodes bei x=-950 positioniert
✅ Alle Nodes bei x >= 50

### 3. **Frame-Children außerhalb**
❌ Children werden unabhängig von Frame positioniert
✅ Children-Position = Frame-Position + Padding + Offset

### 4. **Nicht-deterministisch**
❌ `nodes.forEach()` ohne vorherige Sortierung
✅ `nodes.sort().forEach()`

### 5. **Überlappende Nodes**
❌ Keine Kollisionsprüfung
✅ Post-Processing Kollisions-Adjustierung

## 📊 Metriken für Erfolg

1. **Determinismus**: 100% - Gleicher Input = Gleicher Output
2. **Keine Überlappungen**: 0 Node-Node Kollisionen
3. **Kompaktheit**: Gesamtbreite < 1500px für 15 Nodes
4. **Edge-Klarheit**: < 10% der Edges kreuzen sich
5. **Frame-Korrektheit**: 100% der Children innerhalb Frame
6. **Performance**: < 100ms für 100 Nodes

## 🎨 Layout-Modi

### Compact
- Enger Abstand (280x180)
- Leichtes Staggering (15%)
- Optimiert für Übersicht

### Horizontal
- Level = X-Achse
- Rank = Y-Achse
- Flow von links nach rechts

### Vertical
- Level = Y-Achse
- Rank = X-Achse
- Flow von oben nach unten

## 🔍 Test-Strategie

1. **Generiere HTML-Output** für visuelle Inspektion
2. **Prüfe Kollisionen** programmatisch
3. **Messe Dimensionen** (Breite, Höhe)
4. **Validiere Handle-IDs** gegen React Flow Schema
5. **Teste Determinismus** mit mehrfachen Durchläufen