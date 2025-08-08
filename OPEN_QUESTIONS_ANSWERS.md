### **UX-Flow-Engine: Antworten auf die Fragen**

### **Canvas Engine & UI Fragen**

**1. Canvas Technology Choice**
Wir entscheiden uns für **React Flow**. Der Entwicklungsgeschwindigkeit und der Reichtum an eingebauten Funktionen (Drag-and-Drop, Zoom, Panning) sind in der Anfangsphase entscheidend. Performance-Probleme werden wir durch eine optimierte Daten-Kommunikation (Diffs statt ganzer Flows) und Virtualisierung beheben. Die Migration zu einer Custom-Lösung ist ein mittelfristiges Ziel, wenn das Tool die Performance-Grenzen von React Flow erreicht.

**2. Mermaid.js Migration**
Wir wählen **Option A: Auto-convert all flows to new format on first load**. Dies ist die sauberste Lösung. Die Migration wird einmalig beim ersten Öffnen eines alten Flows durchgeführt und der Flow wird im neuen `.uxflow`-Format gespeichert. Das Backend muss einen `migrator-service` bereitstellen, der die alten Mermaid-Daten in die neue JSON-Struktur überführt.

**3. Node Visual Design**
Die Nodes sollen ein hohes Maß an visueller Anpassung unterstützen, die der Nutzer über das `style`-Objekt steuert.
* **Icons/Emojis**: Ja, es wird eine Icon-Bibliothek geben, die Nodes semantisch anreichert.
* **Custom Colors**: Ja, das ist im `style`-Objekt vorgesehen.
* **Rich Text Formatting**: Ja, dies ist für Notizen und Beschreibungen essenziell.
* **Image/Screenshot Previews**: Ja, im "Present-Mode" zeigen die `Screen`-Nodes eine Vorschau des verknüpften Figma-Screenshots.

---

### **Figma Plugin Fragen**

**4. Figma Authentication**
Wir wählen **Option A: API key generated in web app**. Das ist der sicherste und einfachste Weg. Der Nutzer generiert einen API-Schlüssel in unserer Webanwendung, den er dann im Figma-Plugin eingibt. Jeder Schlüssel ist an einen Workspace gebunden, was die Isolation und Zugriffskontrolle gewährleistet.

**5. Screenshot Storage**
Die Screenshots werden in einem **S3-Bucket** oder einem vergleichbaren Cloud-Speicher (Google Cloud Storage) mit einem **CDN** (Content Delivery Network) gespeichert. Die maximale Dateigröße liegt bei **1MB** pro Screenshot, komprimiert als **WebP**. Alte Screenshots werden nach einer Woche automatisch gelöscht, da sie nur für die Vorschau dienen und das Figma-Dokument die "Single Source of Truth" ist.

**6. Figma Sync Direction**
Der Sync ist **einseitig**: Figma → Editor. Bi-direktionale Synchronisation ist zu fehleranfällig. Wir setzen auf den **"Connect"-Workflow**, bei dem der Nutzer manuell eine Aktion auslöst, um das Flow-Diagramm zu aktualisieren.

---

### **Architektur Fragen**

**7. Monorepo Tool Choice**
Wir nutzen **Turborepo**. Die Geschwindigkeit, die einfache Konfiguration und die exzellente Entwicklererfahrung machen es zur idealen Wahl für unser Projekt.

**8. Frontend Framework**
Wir bestätigen **Next.js 14 mit dem App Router**. Dies bietet uns die Flexibilität für Server-Side Rendering (SSR) und statisches Pre-Rendering, was für die Performance und SEO (Search Engine Optimization) unserer Landing-Page wichtig ist.

**9. State Management**
Wir nutzen **Zustand**. Es ist leichtgewichtig, einfach zu erlernen und bietet eine gute Leistung. Für komplexe Anforderungen können wir es mit React Context kombinieren.

---

### **Collaboration Fragen**

**10. Real-time Collaboration Scope**
Wir setzen den Fokus auf eine **simultane Bearbeitung mit visuellen Indikatoren**.
* **Live-Cursor**: Ja, um zu sehen, wo andere Nutzer arbeiten.
* **Simultane Bearbeitung**: Ja, mit dem `Flow Service`, der atomare Operationen verarbeitet.
* **Echtzeit-Kommentare**: Ja, Kommentare werden sofort im Chat und auf dem Whiteboard angezeigt.
* Voice/Video wird in einer späteren Phase integriert.

**11. Conflict Resolution**
Wir implementieren einen **Optimistic Locking-Ansatz**. Der `Flow Service` nimmt Transaktionen nur an, wenn sie auf dem aktuellsten Flow-Zustand basieren. Bei einem Konflikt wird der Nutzer benachrichtigt und aufgefordert, die Seite neu zu laden, um auf dem neuesten Stand zu arbeiten.

**12. Presence Awareness**
Wir benötigen **Benutzer-Avatare auf der Leinwand**, die anzeigen, wer online ist und wo sich der Cursor befindet. Ein "User is typing"-Indikator im Chat wird ebenfalls implementiert.

---

### **AI Integration Fragen**

**13. Ghost Mode Interaction**
* **Partielle Akzeptanz**: Ja, der Nutzer kann einzelne Geister-Elemente manipulieren und sie dann als Teil des Vorschlags annehmen.
* **Ablaufdatum**: Ja, Vorschläge verfallen nach 15 Minuten Inaktivität, um Server-Ressourcen zu sparen.
* **Mehrere Vorschläge**: Nein, es kann immer nur einen aktiven Vorschlag pro Nutzer geben, um Komplexität zu vermeiden.
* **History**: Ja, Vorschläge sind Teil der Versionsgeschichte und können über den `restore`-Befehl wiederhergestellt werden.

**14. AI Model Selection**
Wir implementieren eine **Simple-UI**-Auswahl, die den Nutzer zwischen "Standard" (schneller, günstiger) und "Pro" (höhere Qualität, potenziell teurer) wählen lässt. Die Kosten werden transparent im Billing-Service-Modul angezeigt.

**15. Visual Interpreter Agent**
Der Agent wird zunächst **UI-Elemente** (Buttons, Textfelder) erkennen und die **Farbpalette** sowie die **allgemeine Stimmung** (z. B. "modern", "minimalistisch") aus dem Figma-Screenshot extrahieren. Barrierefreiheits-Prüfungen sind ein mittelfristiges Ziel.

---

### **Datenmodell Fragen**

**16. Frame Organization**
* **Verschachtelung**: Nein, Frames können nicht verschachtelt werden, um die Komplexität zu reduzieren.
* **Templates**: Ja, wir werden Frame-Vorlagen für häufige Anwendungsfälle anbieten.
* **Berechtigungen**: Ja, Frames erben die Berechtigungen vom Projekt.
* **Max Nodes**: Das Limit liegt bei 500 Nodes pro Frame.

**17. SubFlow Implementation**
* **Verschachtelungstiefe**: Die maximale Verschachtelungstiefe liegt bei 5, um Zirkelbezüge zu vermeiden.
* **Zirkelbezüge**: Der `Flow Service` muss vor dem Speichern auf zirkuläre Abhängigkeiten prüfen und diese blockieren.
* **Versioning**: Subflows sind Teil des Haupt-Flows und werden zusammen mit ihm versioniert.

**18. Migration Strategy**
Wir migrieren die Flows automatisch beim ersten Öffnen. Ein spezielles Migrationstool für den Entwicklungsmodus wird bereitgestellt. Es wird eine Übergangsfrist von 6 Monaten geben.

---

### **Deployment Fragen**

**19. Environment Strategy**
Wir verwenden die **Vercel + Railway**-Lösung. Sie bietet nahtlose Deployments für Frontend und Backend, Previews für jede Code-Änderung und ist einfach zu skalieren.

**20. Database Strategy**
Wir bleiben bei **MongoDB Atlas**. Es ist cloud-nativ, skalierbar und unterstützt unser Dokumenten-basiertes Datenmodell perfekt.

**21. Multi-tenancy**
Wir verwenden eine **"Shared Infrastructure"** mit logischer Datenisolation. Dedicated Deployments sind ein mittelfristiges Ziel für Enterprise-Kunden. SSO ist ein Muss für diese Kunden.

---

### **Business Model Fragen**

**22. Pricing Tiers**
* **Free Tier**: 3 Flows, 100 KI-Anfragen/Monat, 1 Nutzer.
* **Pro Tier**: Unbegrenzte Flows, 1.000 KI-Anfragen/Monat, 5 Nutzer.
* **Figma Plugin**: Das Plugin ist im Free-Tier kostenlos, die KI-Anfragen werden auf das monatliche Guthaben angerechnet.

**23. Usage Metering**
Wir tracken: **KI-API-Anrufe**, die Anzahl der erstellten Flows und die Anzahl der aktiven Nutzer pro Workspace.

**24. Trial Strategy**
Wir bieten eine **14-tägige, kostenlose Testversion** für alle Abos an, ohne dass eine Kreditkarte erforderlich ist. Nach 14 Tagen wird das Konto auf den Free-Tier herabgestuft.

---

### **Analytics Fragen**

**25. User Analytics**
Wir tracken: **Nutzungsmuster**, Feature-Adoption und Fehlerraten mit **Sentry** und einem internen, datenschutzkonformen Analytics-Tool.

**26. Privacy Compliance**
Wir sind **GDPR/CCPA-konform**. Wir bieten eine transparente Opt-in-Option für Analytics und die Möglichkeit, Daten in JSON zu exportieren oder das Konto zu löschen.

---

### **Security Fragen**

**27. Authentication Enhancement**
Wir implementieren **SSO (SAML 2.0)** für Enterprise-Kunden und machen **2FA für alle Administratoren verpflichtend**.

**28. Workspace Isolation**
Unsere Isolation auf Workspace-Ebene ist ausreichend. Der Zugriff auf Projekte ist auf die Mitglieder des jeweiligen Workspaces beschränkt.

---

### **Plattform Fragen**

**29. Mobile Support**
Wir setzen auf einen **"Responsive Web"-Ansatz**. Eine native App ist kein MVP-Ziel.

**30. Desktop Application**
Wir entwickeln in der Anfangsphase keine Desktop-Anwendung.

---

### **Testing Strategy Fragen**

**31. Test Coverage Requirements**
Wir streben eine Testabdeckung von **80 %** für Unit-Tests und **100 %** für E2E-Tests der kritischen Pfade an.

**32. QA Process**
Wir werden ein **kleines, dediziertes QA-Team** haben, das manuelle Tests durchführt.

---

### **Dokumentation Fragen**

**33. Documentation Scope**
Wir erstellen eine umfassende Dokumentation für Nutzer (Anleitungen, Video-Tutorials) und eine API-Dokumentation für Entwickler.

**34. Developer Experience**
Wir unterstützen ein offenes Ökosystem. Es wird eine **Plugin-SDK** und eine gut dokumentierte API mit Webhooks geben.

---

### **MVP Scope Fragen**

**35. MVP Feature Set**
Die vorgeschlagenen MVP-Features sind realistisch. Wir fokussieren uns auf diese 8 Wochen, um ein schnelles Feedback von unseren Nutzern zu erhalten.

**36. Launch Strategy**
Wir starten mit einer **geschlossenen Beta**, um die ersten Nutzer zu sammeln, bevor wir das Produkt öffentlich machen.

---

### **Integration Fragen**

**37. Third-party Integrations**
Wir priorisieren **Jira und Slack**-Integrationen, da sie am relevantesten für den Design- und Entwicklungsprozess sind.

**38. Export Formats**
Wir bieten **PDF, PNG und SVG** als Exportoptionen an. Markdown-Dokumentation ist ein mittelfristiges Ziel.

---

### **Design System Fragen**

**39. Component Library**
Wir setzen auf **Radix UI** wegen seiner Zugänglichkeit und unstyled Komponenten.

**40. Theming Support**
Wir unterstützen **Dark/Light-Modus** und einfache Anpassungen der Markenfarben für Enterprise-Kunden.

---

### **Performance Fragen**

**41. Performance Targets**
Wir streben **unter 200 ms** für 95 % der API-Anfragen an und **mindestens 30 FPS** für die Canvas-Rendering-Engine.

**42. Scalability Planning**
Wir planen, im ersten Jahr **50.000 aktive Nutzer** zu unterstützen.

---

### **Feature Priority Fragen**

**43. Post-MVP Roadmap**
Die Priorität ist: 1. **Present-Mode** (einfach zu implementieren, hoher Mehrwert), 2. **Kommentarsystem** (entscheidend für Kollaboration), 3. **Versionierung UI**, 4. **Fortgeschrittene Figma-Features**, 5. **Persona-Filterung**.

**44. Feature Flags**
Wir nutzen ein Feature-Flag-System, um neue Funktionen sicher zu testen.

---

### **Maintenance Fragen**

**45. Update Strategy**
Wir verwenden **Zero-Downtime-Deployments**, um Wartungsfenster zu vermeiden.

**46. Backwards Compatibility**
Wir unterstützen alte API-Versionen für mindestens **6 Monate**, um Kunden die Möglichkeit zu geben, ihre Integrationen zu aktualisieren.

---

### **Success Metrics Fragen**

**47. KPIs**
Unsere wichtigsten KPIs sind die **User Activation Rate**, die **Feature Adoption** (Wie oft wird die KI genutzt?) und die **Retention Rate**.

**48. Monitoring Requirements**
Wir verwenden **DataDog** für APM (Application Performance Monitoring) und **Sentry** für Error-Tracking.