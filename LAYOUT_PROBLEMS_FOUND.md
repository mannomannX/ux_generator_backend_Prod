# Layout-Probleme Analyse (aus generierten HTMLs)

## 🔴 **Gefundene Probleme**

### 1. **Handle-Separation funktioniert, ABER:**
- IN und OUT sind zwar getrennt (IN oben, OUT unten)
- **Problem**: Bei vielen Verbindungen (5+ pro Node) werden Handles zu eng
- **Visuell**: Handles überlappen sich horizontal (alle auf gleicher Höhe)

### 2. **Edge-Routing ist chaotisch:**
```
Beobachtet im HTML:
- Edges gehen direkt von Punkt zu Punkt (gerade Linien)
- Keine Berücksichtigung von Hindernissen
- Edges kreuzen sich wild
- Keine orthogonalen Pfade (90° Winkel)
```

### 3. **Layout-Modi sind zu simpel:**
- Vertical: Alle Nodes untereinander bei x=200
- Horizontal: Alle nebeneinander bei y=200  
- Compact: Einfaches Grid ohne Intelligenz

### 4. **Fehlende Graph-Analyse:**
- Keine Berücksichtigung der Verbindungsstruktur
- Keine Level-Berechnung (welche Node kommt vor welcher)
- Keine Minimierung von Edge-Längen

## 📊 **Konkrete Beispiele aus HTML**

### Handle-Konflikt Szenario:
```html
Hub Node:
  IN: top-0, top-1, top-2, top-3, top-4  (5 Handles nebeneinander!)
  OUT: bottom-0, bottom-1, bottom-2, bottom-3, bottom-4
  
Problem: Handles sind nur 20px auseinander → Überlappung
```

### Edge-Chaos:
```svg
<line x1="280" y1="280" x2="300" y2="50" />  <!-- Schräg nach oben -->
<line x1="280" y1="410" x2="320" y2="50" />  <!-- Kreuzt andere -->
<line x1="280" y1="540" x2="340" y2="50" />  <!-- Noch mehr Kreuzung -->
```

## 🎯 **Lösungsstrategie**

### **Phase 1: Intelligente Handle-Verteilung**
```typescript
// Statt: Alle Handles nebeneinander
// Neu: Verteile auf alle 4 Seiten

function distributeHandles(node, edges) {
  const incoming = edges.filter(e => e.target === node.id);
  const outgoing = edges.filter(e => e.source === node.id);
  
  // Analysiere Richtungen der verbundenen Nodes
  incoming.forEach(edge => {
    const sourceNode = findNode(edge.source);
    const direction = getRelativeDirection(sourceNode, node);
    // Weise Handle basierend auf Richtung zu
    assignHandle(edge, getOptimalSide(direction, 'in'));
  });
}
```

### **Phase 2: Orthogonales Edge-Routing**
```typescript
// Kein direkter Pfad, sondern Manhattan-Routing
function routeEdgeOrthogonal(source, target) {
  const start = getHandlePosition(source);
  const end = getHandlePosition(target);
  
  // Berechne Zwischenpunkte für 90°-Winkel
  const points = [];
  points.push(start);
  
  // Horizontaler Ausgang vom Source
  const midX = start.x + (end.x - start.x) / 2;
  points.push({ x: midX, y: start.y });
  
  // Vertikale Verbindung
  points.push({ x: midX, y: end.y });
  
  // Horizontaler Eingang zum Target
  points.push(end);
  
  return points;
}
```

### **Phase 3: Hierarchische Positionierung**
```typescript
// Berechne Level basierend auf Abhängigkeiten
function calculateLevels(nodes, edges) {
  const levels = new Map();
  
  // Finde Start-Nodes (keine eingehenden Edges)
  const startNodes = nodes.filter(n => 
    !edges.some(e => e.target === n.id)
  );
  
  // BFS für Level-Zuweisung
  const queue = startNodes.map(n => ({ node: n, level: 0 }));
  
  while (queue.length > 0) {
    const { node, level } = queue.shift();
    levels.set(node.id, level);
    
    // Füge verbundene Nodes zur Queue
    const connected = edges
      .filter(e => e.source === node.id)
      .map(e => ({ 
        node: nodes.find(n => n.id === e.target), 
        level: level + 1 
      }));
    
    queue.push(...connected);
  }
  
  return levels;
}
```

### **Phase 4: Kollisionsvermeidung**
```typescript
// Prüfe und verhindere Überlappungen
function avoidCollisions(nodes, edges) {
  // 1. Node-Node Kollisionen
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodesOverlap(nodes[i], nodes[j])) {
        separateNodes(nodes[i], nodes[j]);
      }
    }
  }
  
  // 2. Edge-Node Kollisionen
  edges.forEach(edge => {
    const path = edge.points;
    nodes.forEach(node => {
      if (pathCrossesNode(path, node)) {
        // Route um Node herum
        edge.points = rerouteAroundNode(path, node);
      }
    });
  });
}
```

## 🔧 **Nächste Schritte**

1. **Implementiere verbesserten Handle-Manager**
   - Nutze alle 4 Seiten
   - Intelligente Zuweisung basierend auf Richtung
   - Dynamische Handle-Anzahl (nicht fix 4 pro Seite)

2. **Implementiere Manhattan-Routing**
   - Nur 90°-Winkel
   - Routing-Grid mit Lanes
   - Kollisionsvermeidung

3. **Implementiere Graph-Analyse**
   - Topologische Sortierung
   - Level-Berechnung
   - Zyklenerkennung

4. **Teste iterativ mit HTML-Output**
   - Generiere nach jeder Änderung neue HTMLs
   - Visuell prüfen
   - Probleme dokumentieren

## 📈 **Metriken für Erfolg**

| Metrik | Aktuell | Ziel |
|--------|---------|------|
| Handle-Konflikte | Viele | 0 |
| Edge-Kreuzungen | Unkontrolliert | Minimiert |
| Edge-Node Überlappungen | Häufig | 0 |
| Orthogonale Edges | 0% | 100% |
| Determinismus | Teilweise | 100% |