### PRODUCT_EXPANSION.md

## 🚀 UX-Flow-Engine: Expansion to Monorepo v3.0

### **Project Goal**

Expand the existing microservices backend into a unified **Monorepo**. This will integrate the new frontend application and the Figma Plugin, creating a cohesive, end-to-end product. The new architecture is designed to support the sophisticated UX-Flow features and a seamless, collaborative workflow.

### **Architectural Shift: Microservices to Monorepo**

The current microservices architecture is excellent for scalability, but a Monorepo is better for a unified developer experience, shared code, and tighter integration between the frontend and backend.

* **Existing Architecture:** 
    * Separate repositories for each service (API Gateway, Flow Service, etc.).
    * Shared code is managed via a separate package.
* **New Monorepo Architecture:** 
    * A single repository with a `packages` directory.
    * Contains all services, the new frontend, and the Figma plugin.
    * Shared code (`@ux-flow/common`) is now part of the Monorepo.
    * Uses a tool like Lerna or Turborepo to manage dependencies and build processes.

### **1. Frontend Application (`/packages/app`)**

We will create a new frontend application that serves as the primary user interface for the UX-Flow-Engine.

#### **1.1. Core Functionality**

* **Unendliche Leinwand:** Implement an SVG/Canvas-based drawing engine (e.g., using `React Flow`, `Svelte Flow`, or a custom solution). This engine will handle rendering nodes, edges, zooming, and panning.
* **Interaktives Whiteboard:** Enable drag-and-drop for nodes, inline text editing, and contextual menus. All user actions must translate into a clear, atomic API call to the Flow Service.
* **KI-Chat-Schnittstelle:** A chat UI in the sidebar will allow users to interact with the Cognitive Core. Responses will be displayed in the chat and on the whiteboard (e.g., in the "Ghost-Modus").

#### **1.2. New Features Integration**

* **"Ghost-Modus" (Interaktive Vorschau):**
    * **Logic:** When the Cognitive Core sends a `PROPOSAL` event, the frontend will render the proposed nodes and edges as semi-transparent "ghost" elements.
    * **User Interaction:** Users can manipulate these ghost elements directly (move, resize, edit). This interaction should not trigger API calls immediately.
    * **Finalization:** A confirmation button (✅) in a modal will trigger the dispatch of the final `APPLY_PROPOSAL` event to the API Gateway, which sends the **final, manipulated state** to the Flow Service.
* **"Present-Mode" (Präsentationsansicht):**
    * **Logic:** Implement a dedicated "present" view that hides all editing controls. The canvas will display a cleaner, more professional view of the flow.
    * **UI:** Nodes will show a live preview of the linked Figma screenshots. Users can click on a node to see a full-screen view of the screenshot with embedded annotations.

### **2. Figma Plugin (`/packages/figma-plugin`)**

The Figma Plugin is a standalone application within the Monorepo that communicates directly with our API Gateway.

#### **2.1. Core Functionality**

* **API-Verbindung:** Implement an API client that uses our provided API Key for authentication. All communication will be handled through this client.
* **"Scaffold" Screens:** The plugin will allow users to select a flow from our editor. It will then automatically generate a new page of frames in the user's Figma file based on the flow's `Screen` nodes and their `responsiveVersions` metadata.
* **"Connect" Workflow:** Add a UI to the plugin that allows users to select a Figma frame and link it to a specific `Screen` node in our editor. This action will trigger an API call to our Flow Service to save the `uiMetadata`.

#### **2.2. New Features Integration**

* **Checklisten-Overlay:** The plugin will create a persistent overlay on Figma frames that displays a checklist of tasks. This list is synced from our Flow Service and updated when a user checks an item.
* **`UPDATE_SCREENSHOT` Button:** Add a button in the plugin UI that allows users to trigger an update of the linked screenshot in our editor, ensuring that the "Present-Mode" always shows the latest design.

### **3. Flow Service (`/packages/flow-service`)**

The Flow Service must be updated to handle the new data models and operations.

#### **3.1. New Data Model (`.uxflow` v3.0)**

The existing MongoDB schema and the `.uxflow` format will be updated to include the following fields:

* **`frames`**: A top-level dictionary of frames, each with a unique ID and name.
* **`nodes[].frameId`**: A new required field on all nodes to link them to a specific frame.
* **`nodes[].isPinned`**: A boolean flag to mark nodes as anchored.
* **`nodes[].uiMetadata`**: A new object that stores all Figma-related data (`externalComponentId`, `screenshotUrl`, `annotations`).

#### **3.2. New Operations (Atomare Aktionen)**

The service's `Transaction Processor` must be updated to support new atomic actions:

* **`ADD_FRAME`**: Adds a new frame to the `frames` dictionary.
* **`DELETE_FRAME`**: Deletes a frame and all nodes associated with its `frameId`.
* **`UPDATE_NODE_LAYOUT`**: This is a new, specialized action that only updates the `position` of a node, respecting its `isPinned` flag.
* **`LINK_FIGMA`**: Adds or updates the `uiMetadata` field of a specific node.

### **4. Cognitive Core (`/packages/cognitive-core`)**

The Cognitive Core needs to understand the new data model and workflows.

#### **4.1. New Prompts & Agents**

* **`Architect Agent`:** Update the prompt to understand the new `frames` and `isPinned` concepts. The agent's output must use the new, atomic actions (`UPDATE_NODE_LAYOUT`, `ADD_FRAME`, etc.).
* **`Visual Interpreter Agent`:** This placeholder agent must be implemented to process image data sent from the Figma Plugin. Its job is to analyze the screenshot, extract key UI elements, and document them in the `annotations` field of the `uiMetadata` object.

### **5. Build & CI/CD Pipeline (`/`)**

The Monorepo build process needs to be reconfigured.

#### **5.1. Build-Tooling**

* Use a tool like **Turborepo** or **NX** to manage the Monorepo.
* Define `build` scripts for each package (e.g., `npm run build` in `/packages/app`, `/packages/flow-service`, etc.).
* The CI/CD pipeline should be updated to run all tests and builds in the Monorepo before deploying the individual services.

---

### **Next Steps**

1.  **Monorepo Setup:** Migrate all services into a single Monorepo structure.
2.  **API Gateway Expansion:** Update the API Gateway to handle new API endpoints for the Figma Plugin and new WebSocket events.
3.  **Data Model Update:** Implement the new `.uxflow` v3.0 schema in the Flow Service.
4.  **Frontend & Plugin Development:** Begin building the new frontend application and the Figma Plugin, focusing on the core workflows.
5.  **KI-Logik-Anpassung:** Update the Cognitive Core to support the new `ACTIONS` and data models.

_**Note:** The Admin Dashboard will be postponed and documented in a separate `ADMIN_PORTAL.md` file._





### Repetition for Cross-checking (just another Version of the Backlog above with other more functional details):


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
    * **Beschreibung:** Als Nutzer möchte ich Knoten (`nodes`) und Verbindungen (`edges`) auf einer unendlichen Leinwand erstellen, bearbeiten und verschieben können, um Flows mit semantischen Knotentypen zu visualisieren.
    * **Funktionalität:**
        * **Datenmodell:**
            * `.uxflow.nodes[]`: Unterstützt die Typen `Screen`, `Decision`, `Action`, `Note`, `SubFlowLink`, `Start`, `End`.
            * `.uxflow.edges[]`: Verbindet Nodes über `source` und `target` IDs.
        * **Atomare Aktionen:**
            * `ADD_NODE`: Fügt einen Knoten mit `id`, `type`, `frameId`, `position` und `data` hinzu.
            * `DELETE_NODE`: Löscht einen Knoten und alle zugehörigen Edges anhand der `id`.
            * `UPDATE_NODE`: Aktualisiert Felder im `nodes.data` oder `nodes.style`-Objekt.
            * `ADD_EDGE`: Fügt eine Verbindung mit `id`, `source`, `target` und `data` hinzu.
    * **Reasoning:** Der direkte Verweis auf das Datenmodell und die Aktionen stellt sicher, dass der `Flow Service` die Daten korrekt verarbeitet und die KI die Befehle präzise formulieren kann.

* **US-1.2: Intelligentes Layout-Tool & Pinnen**
    * **Beschreibung:** Als Nutzer möchte ich die KI nutzen, um meine Flows automatisch und ästhetisch ansprechend anzuordnen, ohne meine manuelle Arbeit zu verlieren.
    * **Funktionalität:**
        * **Datenmodell:**
            * `nodes[].isPinned`: `boolean` - Kennzeichnet manuell gesetzte Ankerpunkte.
        * **Atomare Aktionen:**
            * `UPDATE_NODE_LAYOUT`: Dieser neue Befehl wird vom `Architect Agenten` verwendet und enthält die `id` des Knotens und eine berechnete `position`.
        * **Workflow:** Der Befehl **"Layout optimieren"** im Frontend löst eine Kette von Aktionen aus: Der `Planner Agent` bewertet die Struktur, der `Architect Agent` erstellt eine Liste von `UPDATE_NODE_LAYOUT`-Transaktionen (ohne gepinnte Knoten zu berühren), und der `Flow Service` wendet diese Transaktionen an.
    * **Reasoning:** Die `isPinned`-Eigenschaft im Datenmodell ist entscheidend, damit die KI versteht, welche Knoten unantastbar sind. Der spezialisierte `UPDATE_NODE_LAYOUT`-Befehl trennt die automatische Layout-Anpassung von manuellen Datenänderungen.

* **US-1.3: Navigation & Organisation in komplexen Flows**
    * **Beschreibung:** Als Nutzer möchte ich auch in großen Projekten mit vielen Knoten und Ebenen die Orientierung behalten.
    * **Funktionalität:**
        * **Datenmodell:**
            * `.uxflow.frames`: `object` - Ein Dictionary von Frames mit `name` und `viewport`.
            * `nodes[].frameId`: `string` - Verknüpft einen Knoten mit einem Frame.
            * `nodes[].type = 'SubFlowLink'`: Dieser Knotentyp hat im `data`-Objekt ein Feld `targetFrameId`, das auf einen anderen Frame verweist.
        * **Atomare Aktionen:**
            * `ADD_FRAME`: Erstellt eine neue Leinwand mit `id` und `name`.
            * `DELETE_FRAME`: Löscht einen Frame und alle darin enthaltenen Knoten und Kanten.
    * **Reasoning:** Das Frame-Konzept löst das Skalierbarkeitsproblem direkt im Datenmodell und macht es für das Frontend einfach, die Ansicht zu wechseln.

---

#### **EPIC-2: Kollaboration, Dokumentation & Transparenz**

* **US-2.1: Integriertes Kommentarsystem**
    * **Beschreibung:** Als Nutzer möchte ich direkt im Flow-Diagramm mit meinem Team kommunizieren.
    * **Funktionalität:**
        * **Datenmodell:**
            * `.uxflow.comments[]`: Ein Array von Kommentaren, das `id`, `threadId`, `targetElementId`, `authorId`, `content` und `status` enthält.
        * **Atomare Aktionen:**
            * `ADD_COMMENT`: Fügt ein Kommentarobjekt hinzu.
            * `RESOLVE_COMMENT`: Ändert den `status` eines Kommentars von "offen" zu "gelöst".
    * **Reasoning:** Die Speicherung von Kommentaren im Flow-JSON macht das Dokument selbsterklärend und hält den Kontext an der richtigen Stelle.

* **US-2.2: Transparente Kollaboration**
    * **Beschreibung:** Als Nutzer möchte ich sehen, welche Änderungen von Teammitgliedern oder der KI vorgenommen werden.
    * **Funktionalität:**
        * **Datenmodell:**
            * Die `history`-Collection des `Flow Service` speichert alle Änderungen als atomare Transaktionen.
        * **Kommunikation:** Der `Flow Service` sendet ein `FLOW_UPDATED`-Event an das `API Gateway`, das `userId` und `transactionId` enthält. Das Frontend nutzt diese Info, um das visuelle Feedback (z. B. farbige Rahmen) zu rendern.
    * **Reasoning:** Die Trennung von Datenhaltung und Visualisierung ist hier entscheidend. Der `Flow Service` speichert die "Was"-Informationen, und das Frontend stellt die "Wer"-Informationen visuell dar.

* **US-2.3: Persona- und Ziel-zentrierte Ansichten**
    * **Beschreibung:** Als Nutzer möchte ich meinen Flow aus der Perspektive verschiedener Zielgruppen oder Geschäftsziele filtern und betrachten können.
    * **Funktionalität:**
        * **Datenmodell:**
            * `metadata.personas[]`: Definiert alle Personas.
            * `metadata.userGoals[]`: Definiert alle Nutzerziele.
            * `nodes[].personaIds[]`: Ein Array von Persona-IDs, das dem Knoten zugewiesen ist.
            * `edges[].goalIds[]`: Ein Array von Ziel-IDs, das der Kante zugewiesen ist.
        * **Atomare Aktionen:**
            * `ASSIGN_PERSONA`: Fügt eine Persona-ID zu einem Knoten hinzu.
            * `REMOVE_PERSONA`: Entfernt eine Persona-ID von einem Knoten.
            * `UPDATE_METADATA`: Erstellt neue Personas oder Ziele.
    * **Reasoning:** Die Zuweisung über IDs im Datenmodell ermöglicht eine flexible, maschinenlesbare Logik, die für die KI und die Filterfunktion des Frontends essenziell ist.

---

#### **EPIC-3: Figma-Integration & Design-Sync**

* **US-3.1: "Flow First" - Screens generieren**
    * **Beschreibung:** Als Designer möchte ich meinen Flow im Editor planen und daraus in Figma automatisch die nötige Struktur erstellen.
    * **Funktionalität:**
        * **Datenmodell:**
            * `nodes[].uiMetadata.responsiveVersions[]`: Speichert die verknüpften Versionen eines Screens (`desktop`, `mobile`).
        * **API-Endpunkt:** Das `API Gateway` bietet einen Endpunkt (`/api/v1/flow/export`) an, der das `uxflow`-JSON zurückgibt.
        * **Figma-Plugin:** Das Plugin ruft diese Daten ab, parst die `nodes` vom Typ `Screen` und verwendet die `responsiveVersions`-Information, um leere Figma-Frames in der korrekten Größe und Benennung zu erstellen.
    * **Reasoning:** Der `Flow Service` liefert die Daten, und das Plugin übersetzt diese in Figma-Elemente. Dies ist ein klar definierter Einbahnstraßen-Workflow, der robust ist.

* **US-3.2: "Design First" - Verbinden & Dokumentieren**
    * **Beschreibung:** Als Designer möchte ich meine fertigen Designs in Figma einfach mit dem entsprechenden Flow-Diagramm verknüpfen.
    * **Funktionalität:**
        * **Datenmodell:**
            * `nodes[].uiMetadata`: `object` - Speichert `externalComponentId`, `lastSyncedAt`, `screenshotUrl`, `annotations`.
        * **Atomare Aktionen:**
            * `LINK_FIGMA`: Fügt dem `uiMetadata`-Objekt eine `externalComponentId` und `screenshotUrl` hinzu.
            * `ADD_ANNOTATION`: Fügt dem `uiMetadata.annotations`-Array einen neuen Eintrag hinzu.
        * **Workflow:** Der Befehl **"Verbinden"** im Plugin führt diese Aktionen im Editor aus.
    * **Reasoning:** Die Verknüpfung wird als eine Reihe von atomaren Aktionen im Flow-JSON gespeichert, was die Nachvollziehbarkeit und Versionskontrolle sicherstellt.

---

#### **EPIC-4: Skalierbarkeit & Performance**

* **US-4.1: Optimierte Rendering-Engine**
    * **Beschreibung:** Als Nutzer möchte ich, dass der Editor auch bei Tausenden von Nodes flüssig läuft.
    * **Funktionalität:**
        * **Datenmodell:** Das JSON-Format ist so konzipiert, dass es von einer Canvas-Rendering-Engine effizient verarbeitet werden kann.
* **US-4.2: Effiziente Datenübertragung**
    * **Beschreibung:** Als Nutzer möchte ich, dass die Zusammenarbeit in Echtzeit ohne Verzögerung funktioniert.
    * **Funktionalität:**
        * **Atomare Aktionen:** Die Übertragung von atomaren Aktionen (z. B. `UPDATE_NODE` mit nur einem `position`-Feld) statt des gesamten Flow-JSONs reduziert das Datenvolumen massiv und macht Echtzeit-Kollaboration möglich.

---

#### **EPIC-5: KI-Assistenz & Smart-Features**

* **US-5.1: Der interaktive KI-Assistent**
    * **Beschreibung:** Als Nutzer möchte ich mit der KI interagieren können, um Flow-Vorschläge zu generieren und zu verfeinern.
    * **Funktionalität:**
        * **Datenmodell:** Die "Geister"-Elemente im Frontend sind temporäre `nodes`- und `edges`-Objekte, die noch nicht im `uxflow`-JSON gespeichert sind.
        * **Atomare Aktionen:** Die KI sendet einen `PROPOSAL`-Befehl, der eine Liste von `ADD_NODE`, `ADD_EDGE` etc. enthält. Der Nutzer kann diese Vorschläge im Ghost-Modus manipulieren und dann mit einem `APPLY_PROPOSAL`-Befehl anwenden.
    * **Reasoning:** Die KI operiert mit den gleichen atomaren Aktionen wie ein Mensch, aber in einem separaten, abgesicherten Vorschlagsmodus.

* **US-5.2: "Flow-Check"-Validierung**
    * **Beschreibung:** Als Nutzer möchte ich, dass die KI meinen Flow auf potenzielle Probleme prüft.
    * **Funktionalität:**
        * **Datenmodell:** Die Validierungsergebnisse werden als `error` oder `warning` im `.uxflow.comments[]`-Array gespeichert.
        * **Atomare Aktionen:** Ein neuer Befehl `ADD_VALIDATION_COMMENT` wird erstellt, um die Ergebnisse der Flow-Überprüfung als Kommentare zum Flow hinzuzufügen.
    * **Reasoning:** Die Validierungsergebnisse werden als Kommentare behandelt. So sind sie direkt an der richtigen Stelle im Flow sichtbar und können vom Team diskutiert und gelöst werden.