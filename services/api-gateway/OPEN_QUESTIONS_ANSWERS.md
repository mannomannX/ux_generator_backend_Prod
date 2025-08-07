### API Gateway - Antworten auf offene Fragen

**Zusammenfassung:** Die `api-gateway` Dokumentation zeigt einen Service, der als zentraler, robuster Einstiegspunkt konzipiert ist. Die Sicherheitsmängel sind bekannt und werden adressiert. Die folgenden Antworten zielen darauf ab, die Lücken im Bereich der Frontend-Integration, der Dienstkommunikation und der Skalierung zu schließen, um eine nahtlose UX zu gewährleisten.

---

### Frontend-Integration

**1. WebSocket Protocol:**
Das Frontend erwartet folgende WebSocket-Ereignisse, die über den Redis Event Bus an das Cognitive Core und den Flow Service gesendet werden:
* **`USER_MESSAGE_RECEIVED`**: Startet den KI-generierten Flow-Prozess. Der Frontend-Client sendet eine Textanfrage.
* **`USER_PLAN_APPROVED`**: Der Nutzer genehmigt einen von der KI erstellten Plan. Das Frontend sendet eine Bestätigung, die die logische Struktur des Flows enthält.
* **`IMAGE_UPLOAD_RECEIVED`**: Der Nutzer lädt ein Bild hoch. Das Frontend sendet die Bilddaten, um eine KI-Analyse zu starten.
* **`cursor_position`**: Dient der Echtzeit-Kollaboration. Das Frontend sendet die Position des Cursors, um die Sichtbarkeit für andere Nutzer zu gewährleisten.
* **`join_project`**: Beim Öffnen eines Projekts sendet der Client dieses Event, um den WebSocket-Raum zu betreten und Echtzeit-Updates zu erhalten.

**2. Authentication Flow:**
Das Frontend soll den JWT **primär in den HTTP-Headern** (`Authorization: Bearer <token>`) senden. Dies ist der sicherste und gängigste Ansatz für moderne Single-Page-Anwendungen (SPAs) und mobile Apps. Cookies können als Fallback oder für spezifische Anwendungsfälle (z. B. Authentifizierung über Drittanbieter-Anbieter) in Betracht gezogen werden.

**3. Error Format:**
Das Frontend erwartet ein **standardisiertes, maschinenlesbares JSON-Fehlerformat**. Es sollte unabhängig vom zugrunde liegenden Service-Fehler sein, um konsistentes Frontend-Verhalten zu gewährleisten. Das Format sollte enthalten:
* `status`: Der HTTP-Statuscode (z. B. `400`).
* `message`: Eine kurze, verständliche Fehlermeldung für den Nutzer.
* `code`: Ein interner Fehlercode, der dem Frontend eine logische Fehlerbehandlung ermöglicht.
* `details`: Optionale, detaillierte Informationen, die bei der Fehlerbehebung helfen (z. B. Validierungsfehler-Details).

---

### Service Communication

**1. Flow Service Fallback:**
Wenn der Flow Service nicht verfügbar ist, soll das API Gateway nicht sofort einen Fehler zurückgeben. Der folgende Fallback-Prozess wird implementiert:
* **Anfrage in die Warteschlange stellen:** Die Anfrage soll in eine Redis-Queue gestellt werden, um sicherzustellen, dass keine Daten verloren gehen.
* **Cache-Check:** Das API Gateway überprüft den Redis-Cache, ob eine kürzlich gespeicherte, veraltete Version der Daten vorliegt. Falls ja, wird diese mit einem entsprechenden `Cache-Control`-Header zurückgegeben.
* **Asynchrone Antwort:** Nach dem Warteschlangen-Prozess sendet das API Gateway eine **`202 Accepted`**-Antwort an den Client. Die tatsächliche Verarbeitung und Benachrichtigung über das Ergebnis erfolgt asynchron über WebSockets, sobald der Flow Service wieder verfügbar ist.

**2. Service Discovery:**
Die **Kubernetes Service Mesh-Lösung** ist der bevorzugte Weg. Das Umschreiben der hartkodierten URLs auf einen Service Mesh-Ansatz ist für eine verteilte Microservice-Architektur der Standard.

---

### Rate Limiting

**1. User Tiers:**
Ja, es wird ein Tier-basiertes Rate Limiting geben.
* **Free Tier:** Strikte Limits für AI-Anfragen (z. B. 10 pro Stunde) und Datenoperationen (z. B. 1000 pro Tag).
* **Pro Tier:** Großzügigere Limits, die für den professionellen Einsatz geeignet sind.
* **Enterprise Tier:** Custom-Limits, die in der Konfiguration festgelegt werden können, idealerweise fast ohne Limits.

**2. WebSocket Limits:**
Ja, WebSocket-Verbindungen benötigen ein anderes Rate Limiting als HTTP-Anfragen. Es soll eine Begrenzung der **Anzahl der Nachrichten pro Minute pro Nutzer** geben, um Missbrauch zu verhindern, ohne die Kollaboration zu beeinträchtigen. Zusätzlich muss es ein Limit für die Gesamtzahl der gleichzeitigen WebSocket-Verbindungen geben.

---

### Session Management

**1. Session Storage:**
**JWT** ist für die primäre Authentifizierung ausreichend und sicher. Server-side Sessions sind in unserem Fall **nicht notwendig**, da sensible Informationen nicht am Server gespeichert werden. Die Speicherung von Nutzereinstellungen kann direkt im **User Management Service** in der MongoDB erfolgen, was eine bessere Trennung der Verantwortlichkeiten ermöglicht.

---

### CORS Configuration

**1. Allowed Origins:**
Für die Produktionsumgebung müssen die **genauen Domains whitelisted** werden, von denen das Frontend und alle unterstützten Clients kommen. `*` darf nur im Entwicklungsmodus verwendet werden.

**2. Credentials:**
Ja, CORS muss **Credentials** für die whitelisted Origins zulassen, da der JWT-Token für die Authentifizierung benötigt wird.

---

### Monitoring

**1. Metrics Collection:**
Die wichtigsten Metriken für die Frontend-Dashboards sind:
* **Request Latency:** Zeigt, wie schnell die API auf Anfragen reagiert.
* **Error Rates:** Gibt Aufschluss über die Stabilität des Systems.
* **Active Users:** Wichtig für Geschäftsentscheidungen.
* **WebSocket Connections:** Zeigt die Aktivität der Kollaborationsfunktion.
* **Flow Generation Time:** Ein kritischer UX-Faktor, der die Performance der KI-Pipeline widerspiegelt.

**2. Log Aggregation:**
Die Protokolle werden an den **ELK-Stack** (Elasticsearch, Logstash, Kibana) gesendet. Dies ist eine robuste, standardisierte Lösung für die Log-Aggregation und -Analyse in Microservices-Umgebungen und wird die Arbeit der Entwickler erleichtern.

---

### API Versioning

**1. Deprecation Strategy:**
Wir werden eine **graduelle Deprecation-Strategie** mit einem klaren Zeitplan verfolgen:
* **Ankündigung:** Die Deprecation wird mindestens 6 Monate im Voraus angekündigt.
* **Dokumentation:** Die veraltete Version wird in der API-Dokumentation als `[DEPRECATED]` markiert.
* **HTTP Header:** Wir verwenden den `Sunset`-Header (RFC 8594), um den Zeitpunkt der vollständigen Entfernung anzugeben.
* **Phased-Out:** Die alte Version wird nicht sofort entfernt, sondern der Support wird schrittweise reduziert.

**2. Version Header:**
Die API-Versionierung wird über den **URL-Pfad** erfolgen (z. B. `/api/v1/...`). Dies ist der am einfachsten zu handhabende und am weitesten verbreitete Standard, der auch im bereitgestellten Code-Beispiel verwendet wird.

---

### Caching Strategy

**1. Cache Headers:**
Für nicht-sensible, statische Assets wird der `Cache-Control`-Header mit `max-age` und `public` verwendet. Für API-Anfragen, die sich selten ändern (z. B. die Liste der Templates), wird `stale-while-revalidate` in Betracht gezogen, um das Laden der Seite zu beschleunigen.

**2. CDN Integration:**
Ja, ein **CDN** (Content Delivery Network) wie CloudFlare oder AWS CloudFront wird vor dem API Gateway implementiert, um statische Assets auszuliefern und die Latenz für Benutzer weltweit zu reduzieren.

---

### Security

**1. CSP Headers:**
Das Frontend benötigt eine sorgfältig konfigurierte **Content-Security-Policy** (CSP), die nur Ressourcen von vertrauenswürdigen Quellen (self, Figma-Domains, unsere CDN-Domains) zulässt. Dies schützt vor XSS-Angriffen.

**2. Authentication Providers:**
Zusätzlich zu Google und GitHub werden **SAML/SSO** für Unternehmenskunden und möglicherweise Microsoft Azure AD in Betracht gezogen.

**3. API Keys:**
Ja, wir unterstützen die **API-Key-Authentifizierung** für den programmatischen Zugriff. Sie sollte für Service-zu-Service-Kommunikation und für externe Entwickler (z. B. Figma-Plugin) verwendet werden. API-Keys sind dem Nutzerkonto zugeordnet, können rotiert werden und haben granular definierte Berechtigungen.

---

### Performance

**1. Response Compression:**
Antworten werden mit **Brotli-Kompression** komprimiert. Brotli bietet eine bessere Komprimierungsrate als gzip, was die übertragene Datenmenge reduziert und die Ladezeiten verbessert.

**2. Pagination Defaults:**
Ein Standard-`limit` von **20** mit einer maximalen Begrenzung von **100** ist ein guter Kompromiss zwischen der Menge an Daten und der Performance.

---

### Deployment

**1. Environment Detection:**
Der Service soll die Umgebung über die **`NODE_ENV`**-Umgebungsvariable (`development`, `staging`, `production`) erkennen.

**2. Health Check Requirements:**
Der Health Check unter `/health` soll ein **JSON-Objekt** zurückgeben, wie in der `README.md` definiert. Ein **HTTP GET**-Request mit einem **`200 OK`**-Statuscode und den Status der Abhängigkeiten wird erwartet.