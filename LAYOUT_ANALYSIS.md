# Layout-Algorithmus Analyse & Strategie

## 🔴 **Identifizierte Hauptprobleme**

### 1. **Nicht-Deterministisches Verhalten**
- **Problem**: Gleicher Input produziert unterschiedliche Layouts
- **Ursache**: Zufällige Initialisierung, keine stabile Sortierung
- **Impact**: Verwirrung für User, unmöglich zu testen

### 2. **Edge-Node Überschneidungen**
- **Problem**: Edges fahren durch Nodes hindurch
- **Ursache**: Keine Berücksichtigung von Hindernissen beim Edge-Routing
- **Impact**: Unleserliche Diagramme

### 3. **Handle-Konflikte (In/Out Chaos)**
- **Problem**: Mehrere Edges nutzen gleiche Handles, Input/Output vermischt
- **Ursache**: Keine intelligente Handle-Zuweisung
- **Impact**: Man kann nicht nachvollziehen, woher Edges kommen/hingehen

### 4. **Label-Überlappungen**
- **Problem**: Edge-Labels verdecken wichtige Informationen
- **Ursache**: Labels werden mittig auf Edges platziert ohne Kollisionsprüfung
- **Impact**: Kritische Informationen nicht lesbar

### 5. **Frame-Inkonsistenz**
- **Problem**: Nodes sind mal in Frames, mal außerhalb (je nach Modus)
- **Ursache**: Frame-Beziehungen werden bei jedem Layout neu berechnet
- **Impact**: Unvorhersehbares Verhalten

## 📊 **Detaillierte Problem-Analyse**

### Edge-Routing Probleme:
```
Current:                    Desired:
   A ---\                      A
        |----> C                |
   B ---/                       v
                               C
                               ^
                               |
                               B
```

### Handle-Konflikt Beispiel:
```
Problem:                    Solution:
 [Node A]                   [Node A]
    |→ (alle aus bottom)       |→ out1 (bottom-left)
    |→                         |→ out2 (bottom-right)
    |→                         v
    v                      [Node B]
 [Node B]                     ← in (top)
    ← (alle in top)
```

### Label-Problem:
```
Problem:                    Solution:
   A ----[Label]----> B       A ---------> B
         ^                         [Label]
         |                    (positioned above/below)
    Verdeckt Edge!
```

## 🎯 **Lösungsstrategie**

### **Phase 1: Stabile Grundlage**

#### 1.1 Deterministisches Verhalten
```typescript
// Konsistente Node-Sortierung
nodes.sort((a, b) => {
  // Primär: Node-Typ Hierarchie
  const typeOrder = ['start', 'frame', 'screen', 'decision', 'action', 'end'];
  const typeA = typeOrder.indexOf(a.type) ?? 999;
  const typeB = typeOrder.indexOf(b.type) ?? 999;
  if (typeA !== typeB) return typeA - typeB;
  
  // Sekundär: Alphabetisch nach ID
  return a.id.localeCompare(b.id);
});
```

#### 1.2 Frame-Beziehungen fixieren
```typescript
// Einmalige Berechnung beim Start
const frameRelations = new Map<string, string>();

// Speichere explizite Beziehungen
nodes.forEach(node => {
  if (node.parentId || node.parentNode) {
    frameRelations.set(node.id, node.parentId || node.parentNode);
  }
});

// Diese Beziehungen bleiben über alle Modi konstant
```

### **Phase 2: Intelligentes Layout**

#### 2.1 Hierarchische Analyse
```typescript
interface NodeHierarchy {
  level: number;           // Tiefe im Graph
  rank: number;            // Position in der Ebene
  incoming: string[];      // Eingehende Edges
  outgoing: string[];      // Ausgehende Edges
  siblings: string[];      // Nodes auf gleicher Ebene
}
```

#### 2.2 Smart Handle Assignment
```typescript
interface HandleAssignment {
  nodeId: string;
  handles: {
    top: { in: string[], out: string[] },
    right: { in: string[], out: string[] },
    bottom: { in: string[], out: string[] },
    left: { in: string[], out: string[] }
  }
}

// Regel: Verteile Edges gleichmäßig auf verfügbare Handles
// Priorität: Kürzeste Distanz, dann Richtung des Flows
```

### **Phase 3: Edge-Routing ohne Kollisionen**

#### 3.1 Orthogonales Routing
```typescript
// Alle Edges folgen einem Raster-System
interface EdgeRoute {
  segments: Array<{
    direction: 'horizontal' | 'vertical';
    start: Point;
    end: Point;
  }>;
  lanes: number; // Welche "Spur" nutzt diese Edge
}
```

#### 3.2 Kollisionsvermeidung
```typescript
// A* Pathfinding mit Hindernissen
function routeEdge(source: Node, target: Node, obstacles: Node[]): EdgePath {
  // 1. Definiere Grid
  // 2. Markiere Nodes als Hindernisse
  // 3. Finde optimalen Pfad
  // 4. Glätte Pfad (minimiere Knicke)
}
```

### **Phase 4: Label-Platzierung**

#### 4.1 Smart Label Positioning
```typescript
interface LabelPosition {
  edgeId: string;
  position: 'above' | 'below' | 'start' | 'end';
  offset: { x: number, y: number };
}

// Regel: Labels niemals auf Kreuzungen oder Knickpunkten
// Präferenz: Gerade Segmente, freier Bereich
```

## 🔧 **Implementierungs-Roadmap**

### **Schritt 1: Basis-Algorithmus** (Deterministisch)
1. Stabile Node/Edge Sortierung
2. Fixe Frame-Beziehungen
3. Konsistente Level-Berechnung

### **Schritt 2: Layout-Modi** (Alle auf gleicher Basis)
```typescript
enum LayoutMode {
  VERTICAL,    // Top-to-bottom (Standard)
  HORIZONTAL,  // Left-to-right
  COMPACT,     // Minimaler Platz
  TREE,        // Hierarchisch
  FORCE        // Physik-basiert
}

// ALLE Modi nutzen GLEICHE Hierarchie-Berechnung
// Unterschied nur in Positionierung, nicht in Struktur
```

### **Schritt 3: Edge-Routing**
1. Handle-Pool pro Node (max 4-6 pro Seite)
2. Orthogonales Routing mit Lanes
3. Kollisionserkennung und -vermeidung

### **Schritt 4: Optimierung**
1. Label-Platzierung ohne Überlappung
2. Minimierung von Edge-Kreuzungen
3. Ästhetische Metriken

## 📐 **Neue Algorithmus-Architektur**

```typescript
class PerfectLayoutAlgorithm {
  // 1. Analyse Phase
  analyzeGraph(): GraphStructure
  
  // 2. Hierarchie Phase
  buildHierarchy(): NodeHierarchy[]
  
  // 3. Position Phase
  calculatePositions(mode: LayoutMode): NodePositions
  
  // 4. Handle Phase
  assignHandles(): HandleAssignments
  
  // 5. Routing Phase
  routeEdges(): EdgeRoutes
  
  // 6. Label Phase
  positionLabels(): LabelPositions
  
  // 7. Optimization Phase
  optimizeLayout(): FinalLayout
}
```

## 🎯 **Erfolgs-Kriterien**

1. ✅ **100% Deterministisch**: Gleicher Input = Exakt gleicher Output
2. ✅ **0 Edge-Node Kollisionen**: Keine Edge fährt durch Node
3. ✅ **Klare Handle-Trennung**: In/Out niemals am gleichen Handle
4. ✅ **Lesbare Labels**: Keine Überlappung mit kritischen Elementen
5. ✅ **Frame-Konsistenz**: Children bleiben IMMER in ihren Frames
6. ✅ **Modi-Konsistenz**: Gleiche Struktur, nur andere Anordnung

## 🚀 **Nächste Schritte**

1. **Neuen Algorithmus von Grund auf implementieren**
2. **Schritt-für-Schritt testen mit Visualisierung**
3. **Iterativ verbessern basierend auf realen Daten**