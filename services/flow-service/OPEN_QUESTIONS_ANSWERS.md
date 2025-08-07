### Flow Service - Antworten auf offene Fragen

**Zusammenfassung:** Die Strategie für den `flow-service` ist es, ihn zum robusten und skalierbaren **Herzstück des gesamten Systems** zu machen. Wir geben klare Limits und Regeln vor, um eine hohe Performance zu gewährleisten, und schaffen durch Versionierung und Validierung ein vertrauenswürdiges Fundament für kollaboratives Arbeiten in jedem Unternehmen.

---

### Flow Data Management

1.  **Flow Size Limits:**
    * **Nodes/Edges:** Wir legen ein Soft-Limit von **1.000 Nodes und 2.000 Edges** pro Flow fest. Bei Überschreitung dieser Limits wird eine Warnung ausgegeben, um die Performance zu sichern, aber die Bearbeitung bleibt möglich. Nur Enterprise-Kunden können diese Limits anpassen.
    * **Dateigröße:** Die maximale Dateigröße wird auf **10MB** festgelegt, um die Performance der Echtzeit-Synchronisation zu gewährleisten.
    * **Handhabung:** Wenn die Limits überschritten werden, gibt der Service eine Warnung an den Client aus. Die Anfrage wird weiterhin verarbeitet, aber mit einem potenziellen Performance-Impact. Ein striktes Hard-Limit wird nur eingeführt, wenn es zu kritischen Performance-Problemen kommt.

2.  **Flow Templates:**
    * **Branchen-Templates:** Wir beginnen mit Templates für die am häufigsten nachgefragten Bereiche: **e-Commerce, SaaS (Login/Onboarding), Mobile (Social Media Flow)**.
    * **Nutzer-Templates:** User können Flows als Templates speichern und innerhalb ihrer Workspaces teilen. Ein öffentlicher **Template-Marktplatz** ist eine mittelfristige Vision, um die Community zu fördern.
    * **Versioning:** Templates folgen einem eigenen Versionierungszyklus. Änderungen an Templates beeinflussen nicht bereits genutzte Flows.

3.  **Flow Metadata:**
    * **Pflichtfelder:** `flowName`, `projectId`, `workspaceId`, `createdBy`, `lastModifiedBy` sind obligatorisch.
    * **Custom Metadata:** Wir werden ein `customData`-Objekt auf Top-Level und auf Node-Ebene unterstützen, das unstrukturierte Metadaten aufnehmen kann (z.B. **`personaId`**). Dies ermöglicht eine flexible Anpassung an die Bedürfnisse verschiedener Teams.
    * **Suche:** Alle Standard-Metadaten und Custom Metadata werden indiziert und durchsuchbar gemacht.

---

### Versioning Strategy

1.  **Version Control:**
    * **Versionen pro Flow:** Wir setzen ein Hard-Limit von **100 Versionen pro Flow**. Ältere Versionen werden automatisch archiviert.
    * **Archivierung:** Nach 100 Versionen wird die älteste Version **in ein Cold-Storage-System** (z.B. AWS S3) verschoben, um die primäre Datenbank schlank zu halten.
    * **Branch/Merge:** Dies ist ein komplexes Git-ähnliches Feature, das in der ersten Phase nicht umgesetzt wird. Das Versionierungssystem bleibt linear.

2.  **Diff und Rollback:**
    * **Granularität:** Die Versionierung speichert den **vollständigen Flow-Zustand** (Snapshot), da dies für die Wiederherstellung am einfachsten ist. Ein Diff-System dient der **Visualisierung von Änderungen**, um dem Nutzer zu zeigen, was sich geändert hat.
    * **Rollback:** Der Rollback wird als neue Version behandelt. Wenn ein Nutzer zu Version 10 zurückkehrt, wird Version 10 zur neuen Version 101. Die alte Version 100 bleibt in der Historie erhalten.

3.  **Version Performance:**
    * Wir werden alte Versionen nach 90 Tagen automatisch in Cold-Storage archivieren.
    * Versionen werden beim Speichern komprimiert. Die Wiederherstellung (Rollback) sollte innerhalb von **3 Sekunden** erfolgen.

---

### Validation Rules

1.  **Business Logic Validation:**
    * **Industrie-Regeln:** Wir beginnen mit einer zentralen, erweiterbaren Regel-Engine, die UX-Best-Practices prüft (z.B. "Ein `Screen`-Knoten sollte immer einen `End`-Knoten erreichen können").
    * **Workspace-Regeln:** Enterprise-Kunden können eigene, workspace-spezifische Validierungsregeln definieren.
    * **Severity:** Es gibt `error` (blockiert die Speicherung) und `warning` (erlaubt die Speicherung, zeigt aber eine potenzielle Schwachstelle an).

2.  **Flow Integrity:**
    * Die Validierung prüft auf `orphaned nodes`, `circular dependencies`, `multiple start nodes` und `nicht-erreichbare end nodes`.
    * Die maximale Verschachtelungstiefe (`max nesting depth`) für Sub-Flows wird auf 10 festgelegt, um die Komplexität zu kontrollieren.

3.  **Data Quality:**
    * Jeder Knoten-Typ hat eine feste Schema-Definition (z.B. ein `Screen`-Knoten benötigt das Feld `flowName`).
    * Die Validierung überprüft, ob diese Pflichtfelder vorhanden sind.

---

### Collaboration Features

1.  **Real-time Collaboration:**
    * **Strategie:** Wir setzen auf **"Operational Transformation" (OT)**, da es eine hohe Granularität und die beste Kollaborationserfahrung bietet. `Last-write-wins` ist einfacher, führt aber zu Datenverlusten.
    * **Visualisierung:** Wir unterstützen `user presence indicators` (Avatare, die anzeigen, wer online ist) und `cursor sharing`, um die Zusammenarbeit zu visualisieren.

2.  **Access Control:**
    * Wir bieten granulare Berechtigungen (`viewer`, `editor`, `admin`) auf Projektebene.
    * `x-user-id` im Header wird für die Authentifizierung genutzt. Das **API Gateway** ist für die eigentliche JWT-Validierung zuständig.

3.  **Comments and Annotations:**
    * **Funktion:** Ja, wir unterstützen ein vollwertiges Kommentarsystem mit `comment threading`, `@mentions` und Benachrichtigungen.
    * **Lösung:** Die Kommentardaten werden in der `.uxflow`-Datei innerhalb des `nodes`- und `edges`-Objekts gespeichert, um sie direkt mit dem jeweiligen Element zu verknüpfen.

---

### Export/Import Capabilities

1.  **Export Formats:**
    * **Priorität:** Zunächst die wichtigsten: **JSON (native), PDF, PNG, Mermaid**.
    * **Figma-Export:** Eine Figma-Exportfunktion wird ein JSON-Format erzeugen, das unser Figma-Plugin lesen kann.

2.  **Import Sources:**
    * Wir unterstützen zunächst nur den Import von unserem **eigenen `.uxflow`-Format**. Der Import von externen Formaten ist ein komplexer Parsing-Job, der in einer späteren Phase angegangen wird.

3.  **Bulk Operations:**
    * Wir unterstützen Batch-Operationen von bis zu **100 Transaktionen pro Anfrage**.

---

### Flow Execution

* Wir sehen die Ausführung des Flows als eine Aufgabe des **`cognitive-core`**, das für die Simulation und KI-Logik zuständig ist. Der `flow-service` ist für die **reine Datenhaltung** verantwortlich.

---

### Analytics and Insights

* Wir werden Performance-Metriken (z.B. Flow-Erstellungszeit) und die Nutzung von Node-Typen tracken.
* Die Business Intelligence wird von einem externen Dienst übernommen, der die Daten aus unserem Audit-Log erhält.

---

### Integration Points

* **JIRA/Slack:** Integrationen werden über das **API Gateway** realisiert, das von den entsprechenden Diensten getriggert wird.
* **Webhook Events:** Der `flow-service` wird `FLOW_UPDATED` und `FLOW_VALIDATION_COMPLETED` Ereignisse an das API Gateway senden, um externe Integrationen und Benachrichtigungen zu ermöglichen.

---

### Performance Optimization

* **Caching:** Wir verwenden ein **Redis-basiertes, verteiltes Caching** für häufig aufgerufene Flows. Die Cache-TTL wird auf 5 Minuten gesetzt.
* **Datenbank:** Wir setzen auf eine **Sharding-Strategie**, um die Daten über mehrere Server zu verteilen, sobald das System skaliert.

---

### Compliance and Security

* **Datenschutz:** Alle Flow-Daten werden **verschlüsselt** im Ruhezustand gespeichert.
* **Audit:** Alle Flow-Operationen (Erstellen, Ändern, Löschen) werden in einem separaten, unveränderlichen Audit-Log erfasst, das für die Nachvollziehbarkeit entscheidend ist.

---

### Disaster Recovery

* Wir werden eine **Point-in-Time Recovery** mit täglichen Backups implementieren.
* Der RTO (Recovery Time Objective) wird auf **4 Stunden** und der RPO (Recovery Point Objective) auf **24 Stunden** festgelegt.