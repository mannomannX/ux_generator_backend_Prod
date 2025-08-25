# Ultimate Smart Layout Algorithm Plan

## Kernproblem-Analyse

### Aktuelle Probleme:
1. **Handle-Mixing**: In/Out werden am gleichen Punkt gemischt (KRITISCH!)
2. **Chaos in Frames**: Nodes in Frames sind willkürlich positioniert
3. **Zu große Abstände**: Layout ist nicht kompakt genug
4. **Schlechte Edge-Routing**: Lange, unnatürliche Pfade
5. **Keine Vorhersehbarkeit**: Layout sieht bei jedem Run anders aus

### Kern-Anforderungen:
1. **Strikte Handle-Separation**: Ein Punkt ist ENTWEDER Ein- ODER Ausgang
2. **Kompaktheit**: Minimale Gesamtfläche bei guter Lesbarkeit
3. **Klarheit**: Offensichtlicher Flow, keine Verwirrung
4. **Determinismus**: Gleiche Inputs = Gleiches Layout
5. **Frame-Awareness**: In-Frame Nodes optimal zu externen Verbindungen

## Der neue Algorithmus-Ansatz

### Paradigmenwechsel: Von 3 Passes zu iterativem Refinement

Statt starrer 3 Passes nutzen wir einen **iterativen Constraint-Solver**:

```
Initial Placement → Constraint Analysis → Local Optimizations → Global Refinement
                           ↑                                              ↓
                           ←──────────────────────────────────────────────
```

## Phase 1: Smart Initial Placement (SIP)

### 1.1 Graph-Analyse
```javascript
{
  mainSpine: [],        // Hauptfluss (Start → End)
  branches: Map<>,      // Verzweigungen vom Hauptfluss
  clusters: Map<>,      // Stark verbundene Komponenten
  isolates: [],         // Unverbundene Nodes
  frames: Map<>         // Frame → Contents mapping
}
```

### 1.2 Hierarchie-Erstellung
- **Level 0**: Start-Nodes
- **Level N**: Nodes mit max. Distanz N vom Start
- **Sonderfälle**: Zyklen werden aufgebrochen, Back-Edges markiert

### 1.3 Kompakte Positionierung
```
Für jedes Level:
  - Berechne optimale X-Position basierend auf:
    * Vorgänger-Positionen (Mittelwert)
    * Nachfolger-Positionen (Vorausschau)
    * Geschwister-Abstände (Minimal aber lesbar)
  - Y-Position = Level * kompakter_Abstand
```

### 1.4 Frame-Interne Layouts
```
Für jeden Frame:
  - Identifiziere Ein/Ausgangs-Nodes (Boundary Nodes)
  - Positioniere Boundary Nodes nahe Frame-Kanten
  - Fülle Innenraum mit internen Nodes (kompaktes Sub-Layout)
```

## Phase 2: Handle Assignment System (HAS)

### 2.1 Handle-Verfügbarkeits-Matrix
```javascript
NodeHandles = {
  nodeId: {
    top:    { in: [], out: [] },
    right:  { in: [], out: [] },
    bottom: { in: [], out: [] },
    left:   { in: [], out: [] }
  }
}
```

### 2.2 Edge-Priorisierung
1. **Kritische Edges**: Start → X, X → End
2. **Hauptfluss-Edges**: Auf dem längsten Pfad
3. **Normale Edges**: Alle anderen
4. **Back-Edges**: Zyklen/Rückwärts-Verbindungen

### 2.3 Handle-Zuweisung-Algorithmus
```
Für jede Edge (in Prioritätsreihenfolge):
  1. Berechne ideale Richtung (source → target)
  2. Finde verfügbare Handles:
     - Source: Nur Handles ohne incoming edges
     - Target: Nur Handles ohne outgoing edges
  3. Wähle Handle-Paar mit minimalem Score:
     Score = edge_length + obstacle_penalty + angle_penalty
  4. Markiere Handles als belegt
  5. Bei Konflikt: Nutze Ausweich-Handle mit Warnung
```

### 2.4 Konflikt-Resolution
- **Soft Conflict**: Suboptimaler Handle → Akzeptieren
- **Hard Conflict**: Kein Handle frei → Node verschieben

## Phase 3: Collision Detection & Resolution (CDR)

### 3.1 Kollisions-Typen (nach Priorität)
1. **Edge-Node**: Edge schneidet Node → KRITISCH
2. **Label-Overlap**: Labels überlagern sich → KRITISCH
3. **Edge-Edge**: Edges kreuzen sich → VERMEIDBAR
4. **Node-Node**: Nodes überlagern sich → FEHLER

### 3.2 Smart Resolution Strategy
```
Für jede Kollision:
  1. Berechne minimale Verschiebung zur Auflösung
  2. Prüfe Constraints:
     - Frame-Boundaries
     - Minimum Spacing
     - Handle-Verbindungen
  3. Wähle Lösung:
     a) Node verschieben (wenn möglich)
     b) Handle ändern (wenn verfügbar)
     c) Edge umrouten (als letztes Mittel)
```

## Phase 4: Quality Metrics & Refinement (QMR)

### 4.1 Qualitäts-Metriken
```javascript
Quality = {
  edgeLengthTotal: sum(all_edge_lengths),
  edgeCrossings: count(edge_intersections),
  compactness: bounding_box_area,
  symmetry: balance_score,
  readability: flow_clarity_score
}
```

### 4.2 Iterative Verbesserung
```
While (quality_improving && iterations < MAX):
  1. Identifiziere schlechtesten Bereich
  2. Wende lokale Optimierung an:
     - Node-Swapping
     - Handle-Rotation
     - Micro-Adjustments
  3. Prüfe globale Auswirkungen
  4. Akzeptiere/Verwerfe Änderung
```

## Spezial-Features

### F1: Frame-Boundary-Optimization
- Nodes mit externen Verbindungen werden an Frame-Rand positioniert
- Interne Nodes füllen Frame-Mitte
- Frame-Größe passt sich Inhalt an

### F2: Flow-Continuity
- Intermediate Nodes (1 in, 1 out) bekommen aligned handles
- Durchgehende Pfade werden gerade gehalten
- Verzweigungen werden visuell klar

### F3: Label-Placement
- Labels werden entlang Edges positioniert
- Automatische Verschiebung bei Überlappung
- Klarheit hat Priorität vor Ästhetik

## Implementation Strategy

### Schritt 1: Core-Struktur
- Graph-Analyse-Funktionen
- Constraint-System
- Handle-Manager

### Schritt 2: Layout-Engine
- Initial Placement
- Handle Assignment
- Collision Detection

### Schritt 3: Optimization
- Quality Metrics
- Iterative Refinement
- Performance Tuning

### Schritt 4: Polish
- Edge-Smoothing
- Label-Placement
- Visual Tweaks

## Erwartete Verbesserungen

1. **0% Handle-Mixing**: Strikte Trennung garantiert
2. **50% kompakter**: Dichteres Layout
3. **100% deterministisch**: Gleiche Ergebnisse
4. **90% weniger Kollisionen**: Proaktive Vermeidung
5. **Klarer Flow**: Offensichtliche Richtungen

## Algorithmus-Pseudocode

```javascript
function smartLayout(nodes, edges) {
  // Phase 1: Smart Initial Placement
  const analysis = analyzeGraph(nodes, edges);
  const hierarchy = buildHierarchy(analysis);
  let positions = calculateCompactPositions(hierarchy);
  positions = optimizeFrameLayouts(positions);
  
  // Phase 2: Handle Assignment
  const handleManager = new HandleManager(nodes);
  const sortedEdges = prioritizeEdges(edges, analysis);
  const handles = assignOptimalHandles(sortedEdges, positions, handleManager);
  
  // Phase 3: Collision Resolution
  let iteration = 0;
  while (hasCollisions(positions, handles) && iteration < 10) {
    const collisions = detectCollisions(positions, handles);
    positions = resolveCollisions(collisions, positions, constraints);
    handles = updateHandles(positions, handles);
    iteration++;
  }
  
  // Phase 4: Quality Refinement
  const quality = calculateQuality(positions, handles);
  if (quality.score < THRESHOLD) {
    positions = refineLayout(positions, handles, quality);
  }
  
  return { nodes: positions, edges: handles };
}
```

## Zeitplan

1. **Core-Struktur**: Graph-Analyse, Constraint-System
2. **Initial Placement**: Hierarchie, Kompakte Positionierung
3. **Handle System**: Strikte Trennung, Optimale Zuweisung
4. **Collision System**: Detection, Smart Resolution
5. **Refinement**: Quality Metrics, Iterative Verbesserung
6. **Testing & Tuning**: Edge Cases, Performance

## Success Criteria

- ✅ Keine Handle-Mixing (0 Tolerance)
- ✅ Kompaktes Layout (< 50% der aktuellen Größe)
- ✅ Klare Flows (> 90% Lesbarkeit)
- ✅ Deterministisch (100% gleiche Ergebnisse)
- ✅ Frame-Aware (Optimale In/Out Positionen)
- ✅ Performance (< 100ms für 100 Nodes)