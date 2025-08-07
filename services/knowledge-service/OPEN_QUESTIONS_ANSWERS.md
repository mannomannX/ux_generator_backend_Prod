### Knowledge Service - Antworten auf offene Fragen

**Zusammenfassung:** Die Strategie für den `knowledge-service` ist es, ein hochpräzises RAG-System zu bauen, das auf einem pragmatischen Ansatz basiert. Wir setzen auf bewährte externe Dienste, um die Komplexität zu reduzieren, und fokussieren uns auf die Isolation von Kundendaten sowie auf die Qualität und Relevanz der gelieferten Antworten.

---

### Embedding Model Selection

1.  **Primary Embedding Provider:**
    * Wir nutzen zunächst **OpenAI's `text-embedding-ada-002`** als Standard-Anbieter. Dieser Anbieter ist in der Branche etabliert und bietet eine gute Balance zwischen Kosten und Qualität. Die nahtlose Integration mit `ChromaDB` ist ein weiterer Vorteil.
    * Eine Integration von Googles Embeddings als Alternative ist bereits geplant und wird als Failover-Lösung genutzt.

2.  **Embedding Configuration:**
    * Wir verwenden die Standard-Vektordimensionen des jeweiligen Anbieters (z. B. 1536 für `text-embedding-ada-002`).
    * **Multi-Language-Support** ist ein Muss und wird in der ersten Phase für Englisch und Deutsch implementiert.

3.  **Cost Management:**
    * Wir implementieren ein **intelligentes Caching** für Embeddings. Wenn ein identisches Dokument oder ein identischer Text-Chunk bereits verarbeitet wurde, nutzen wir den bestehenden Vektor. Dies reduziert die Kosten erheblich.
    * Das Budget für Embedding-API-Aufrufe wird im **Billing Service** pro Kunde nachverfolgt.

---

### Vector Database Strategy

1.  **ChromaDB Configuration:**
    * Wir betreiben `ChromaDB` in einer **Managed Cloud-Instanz**, um die Skalierung und Verfügbarkeit zu gewährleisten. Die lokale Instanz dient nur für die Entwicklung.
    * Die Partitionierung erfolgt auf der Ebene der **Collections** (`global`, `workspace`, `project`), um eine strikte Isolation der Daten zu gewährleisten.
    * Als Index-Typ verwenden wir den **standardmäßigen HNSW-Index** von `ChromaDB`, da er eine hervorragende Balance zwischen Suchgeschwindigkeit und Genauigkeit bietet.

2.  **Alternative Vector DB:**
    * Wir halten `ChromaDB` vorerst bei, um die Komplexität zu minimieren. Wenn das System skaliert und wir die Grenzen von `ChromaDB` erreichen, ziehen wir die Migration zu einem Anbieter wie **Pinecone** oder **Weaviate** in Betracht.

3.  **Hybrid Search:**
    * Ja, wir werden einen **hybriden Suchansatz** implementieren, der eine semantische Ähnlichkeitssuche mit einer herkömmlichen Keyword-Suche (BM25) kombiniert. Die Ergebnisse werden in einer **Re-Ranking-Strategie** neu geordnet, um die Relevanz weiter zu verbessern.

---

### Knowledge Graph Implementation

* Da dies ein komplexes Feature ist und unser Fokus auf der Perfektion des RAG-Systems liegt, **verzichten wir in der ersten Phase auf die Implementierung von Graph-Funktionen**. Wir werden die Entities und Beziehungen zunächst als Metadaten im RAG-System speichern. Eine Graph-Integration ist ein mittelfristiges Ziel.

---

### RAG Pipeline Enhancement

1.  **Context Window Management:**
    * Die maximale Kontextgröße wird **dynamisch** auf der Grundlage des verwendeten AI-Modells verwaltet. Die Prompts werden so zugeschnitten, dass sie in das Kontextfenster passen.
    * Die Chunking-Strategie basiert auf einer intelligenten Aufteilung des Textes, um sicherzustellen, dass logische Einheiten (z. B. ein ganzer Satz oder Abschnitt) intakt bleiben.

2.  **Retrieval Strategy:**
    * Wir verwenden einen **Top-K-Wert von 5 bis 10** für die Abfrage.
    * Die Ergebnisse werden auf der Grundlage ihrer **Relevanzbewertung und Quelle** (z. B. Projektwissen hat eine höhere Relevanz als globales Wissen) gewichtet und neu geordnet.

3.  **Answer Generation:**
    * Jede Antwort muss die Quellen aus der Knowledge Base **zitieren**. Das Zitat muss anklickbar sein und den Nutzer zur ursprünglichen Quelle führen.
    * Die KI muss die Quellen **verifizieren** und bei Halluzinationen eine Warnung ausgeben.

---

### Knowledge Base Content

1.  **Pre-loaded Knowledge:**
    * Wir werden eine umfassende Bibliothek mit **UX-Frameworks** (z. B. Atomic Design), Design-System-Dokumentationen und den wichtigsten WCAG-Standards und -Prinzipien vorinstallieren.
    * Zusätzlich werden wir allgemeine **UX-Best-Practices** für die gängigsten Flows (z. B. Login, Checkout) aufnehmen.

2.  **Content Updates:**
    * Die Inhalte werden **quartalsweise aktualisiert**.
    * Wir werden ein **Content-Management-System** entwickeln, um die Inhalte unserer Wissensdatenbank zu verwalten.

3.  **User Contributions:**
    * Ja, Nutzer können eigene Dokumente hochladen, aber diese sind **standardmäßig nur für ihren Workspace sichtbar**.
    * Eine manuelle Moderation ist für die Freigabe von Dokumenten für die globale Wissensdatenbank obligatorisch.

---

### Performance Requirements

1.  **Latency Targets:**
    * **Embedding Generation:** < 500ms
    * **Vector Search:** < 100ms
    * **Full RAG Pipeline:** < 2s

2.  **Scalability:**
    * Das System ist darauf ausgelegt, Tausende von Dokumenten und Hunderten von gleichzeitigen Anfragen zu verarbeiten.

---

### Security & Privacy

1.  **Data Isolation:**
    * Wir implementieren eine **strikte Datenisolation** auf der Ebene der **`ChromaDB`-Collections**. Jedes Projekt und jeder Workspace hat eine eigene, logisch getrennte Sammlung.
    * Alle Daten werden im Ruhezustand (at rest) verschlüsselt.

2.  **PII Handling:**
    * Wir werden eine **PII-Erkennung** implementieren, die alle hochgeladenen Dokumente prüft. Bei der Erkennung von PII wird der Nutzer aufgefordert, die Daten vor der Indexierung zu entfernen.
    * Die Datenverarbeitung ist **GDPR-konform**.

3.  **Audit & Compliance:**
    * Wir protokollieren jede Abfrage, jeden Dokumentenupload und jeden Zugriff. Das ist für die **Compliance** entscheidend.

---

### Integration Points

1.  **Cognitive Core Integration:**
    * Der `Cognitive Core` sendet Anfragen in **Echtzeit**.
    * Wir senden den abgerufenen Kontext im `KNOWLEDGE_RESPONSE_READY`-Event an den `Cognitive Core`.

2.  **External Knowledge Sources:**
    * Wir planen, in der nächsten Phase APIs von externen Quellen (z. B. WCAG-Spezifikationen) zu integrieren.

3.  **Export/Import:**
    * Nutzer können ihre eigenen hochgeladenen Dokumente im Originalformat exportieren.

---

### Monitoring & Analytics

1.  **Usage Metrics:**
    * Wir verfolgen die Abfrage-Muster, die beliebtesten Wissensbereiche und die Effektivität der Suche (Relevanzbewertung).

2.  **Quality Metrics:**
    * Wir messen die Genauigkeit der Retrieval-Ergebnisse und die Qualität der Antworten, die von der KI generiert werden.

3.  **Performance Monitoring:**
    * Wir überwachen die Latenz der Abfragen und die Fehlerraten in Echtzeit, um sicherzustellen, dass die Performance-Ziele eingehalten werden.

---

### Cost Optimization

1.  **Embedding Costs:**
    * Die Kosten werden über den `Billing Service` nachverfolgt und den jeweiligen Nutzern zugeordnet.
    * Die Preise werden so festgelegt, dass wir eine Marge erzielen.

2.  **Storage Costs:**
    * Das Speichervolumen der Vektoren wird kontinuierlich überwacht, um die Kosten im Griff zu behalten. Alte Dokumente werden archiviert, um die Kosten zu senken.

3.  **Compute Costs:**
    * Da wir externe Anbieter nutzen, entfallen die Kosten für GPUs. Die Rechenleistung für das Embedding und RAG-Prozess wird über die APIs der Anbieter bezogen.