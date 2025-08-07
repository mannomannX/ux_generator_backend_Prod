### Billing Service - Antworten auf offene Fragen

**Zusammenfassung:** Die Strategie für den Billing Service ist, eine einfache, transparente und vertrauenswürdige Plattform zu schaffen. Wir setzen auf Standardlösungen, um die Komplexität zu reduzieren, und konzentrieren uns auf die Bedürfnisse von Pro- und Enterprise-Kunden.

---

### Payment Processing

1.  **Refund Policy:**
    * **Monatliche Abos:** Wir bieten eine 30-tägige Geld-zurück-Garantie für alle monatlichen Abonnements, ohne Fragen.
    * **Jährliche Abos:** Bei jährlichen Abos gilt die 30-Tage-Regel ebenfalls. Nach 30 Tagen gibt es keine anteiligen Rückerstattungen.
    * **Guthaben:** Einmal gekauftes Guthaben ist nicht erstattungsfähig, kann aber für einen begrenzten Zeitraum genutzt werden.

2.  **Currency Support:**
    * Wir starten mit **USD und EUR** als primäre Währungen. Stripe ermöglicht die einfache Handhabung von Multi-Currency-Transaktionen.
    * Die Anzeige und Abrechnung erfolgt in der Währung, die bei der Registrierung ausgewählt wurde. Die Währung kann einmalig im Abrechnungsbereich geändert werden.

3.  **Tax Handling:**
    * Stripe Tax wird für die automatische Berechnung und Einziehung von Umsatzsteuern (VAT/GST) genutzt. Wir werden Stripe so konfigurieren, dass es die Umsatzsteuer für alle unterstützten Regionen automatisch berechnet.
    * Kunden können eine Steuernummer eingeben, um als steuerbefreit gekennzeichnet zu werden.

---

### Subscription Management

1.  **Plan Changes:**
    * **Upgrades:** Upgrades werden **sofort wirksam**. Der Kunde zahlt den anteiligen Differenzbetrag für den Rest des aktuellen Abrechnungszeitraums.
    * **Downgrades:** Downgrades treten **am Ende des aktuellen Abrechnungszeitraums** in Kraft, um die Nutzung der bereits bezahlten Features zu gewährleisten.
    * Die Proration-Berechnung wird von Stripe übernommen.

2.  **Trial Periods:**
    * Wir bieten eine **14-tägige, kostenlose Testversion** für alle Abonnements (Basic, Pro). Die Kreditkarte ist **nicht erforderlich**, um eine Testversion zu starten.
    * Am Ende des Testzeitraums wird der Zugang zu kostenpflichtigen Funktionen automatisch deaktiviert und der Kunde wird auf den kostenlosen Tarif zurückgestuft.

3.  **Grace Periods:**
    * Wir gewähren eine **7-tägige Nachfrist** für fehlgeschlagene Zahlungen.
    * Stripe wird so konfiguriert, dass es während dieser Zeit automatische Zahlungsversuche unternimmt.
    * Der Kunde wird per E-Mail benachrichtigt, wenn eine Zahlung fehlschlägt und der Status der Nachfrist klar kommuniziert.

---

### Credit System

1.  **Credit Pricing:**
    * Wir starten mit festen Guthabenpaketen (z. B. 1.000, 5.000, 10.000 Credits). Es werden **Volumenrabatte** angeboten.
    * Gekaufte Credits **laufen nicht ab**, solange das Konto aktiv ist.
    * Credits werden über Stripe als "prepaid credits" verwaltet.

2.  **Credit Usage:**
    * Ja, es gibt **unterschiedliche Kosten** für verschiedene Vorgänge (z. B. die Nutzung des `Vision Processing` ist teurer als eine Standard-KI-Anfrage).
    * Guthaben kann innerhalb eines Workspace **zwischen den Nutzern geteilt** werden.

3.  **Credit Grants:**
    * Wir werden Werbeguthaben für Marketingkampagnen und Empfehlungsboni anbieten.
    * Der Support hat die Möglichkeit, Kunden als Geste des guten Willens oder zur Fehlerbehebung manuell Guthaben gutzuschreiben.

---

### Billing Cycles

1.  **Billing Frequency:**
    * Wir bieten sowohl **monatliche als auch jährliche Abonnements** an, mit einem Rabatt für die jährliche Zahlung.
    * Für Unternehmenskunden sind individuelle Abrechnungszyklen und Zahlungsbedingungen (z. B. auf Rechnung) vorgesehen.

2.  **Invoice Generation:**
    * Rechnungen werden von Stripe **automatisch** generiert und per E-Mail an den Kunden verschickt.
    * Die Rechnungsnummerierung wird von Stripe verwaltet, was für unsere Buchhaltung ausreicht.

---

### Payment Methods

1.  **Accepted Methods:**
    * Wir akzeptieren zunächst **Kredit- und Debitkarten** über Stripe.
    * Für Unternehmenskunden bieten wir die Möglichkeit der **SEPA-Überweisung** an. PayPal oder Kryptowährungen sind für eine spätere Phase geplant.

2.  **Payment Method Management:**
    * Kunden können **mehrere Zahlungsmethoden** hinterlegen und eine davon als Standard festlegen.

---

### Webhooks

1.  **Event Handling:**
    * Wir verarbeiten alle in der `README.md` genannten Events, da sie für das ordnungsgemäße Funktionieren von Abonnements und Zahlungen entscheidend sind.
    * Die Wiederholungsstrategie von Stripe ist robust genug; wir benötigen keine eigene. Bei einem Scheitern werden Benachrichtigungen an einen Dead-Letter-Queue-Mechanismus gesendet, um eine manuelle Untersuchung zu ermöglichen.

2.  **Notification Strategy:**
    * Wir nutzen eine Kombination aus **E-Mail- und In-App-Benachrichtigungen**. Kritische Ereignisse wie Zahlungsausfälle lösen beides aus.

---

### Compliance

1.  **PCI Compliance:**
    * Wir erfüllen die Anforderungen an die **PCI-Konformität auf Ebene 2** durch die vollständige Integration mit Stripe, die alle sensiblen Kartendaten verarbeitet. Lokale Speicherung von sensiblen Daten ist nicht erlaubt.

2.  **Financial Regulations:**
    * Wir starten mit der Unterstützung für die EU und die USA. Dies erfordert die Einhaltung der jeweiligen Finanzvorschriften und Steuern. KYC-Prüfungen sind vorerst nicht erforderlich.

---

### Enterprise Features

1.  **Volume Licensing:**
    * Wir bieten Volumenlizenzen und Sonderpreise für Unternehmenskunden mit einer großen Anzahl von Nutzern an. Die Abrechnung erfolgt über eine individuelle Vereinbarung außerhalb des Standard-Stripe-Workflows, aber die Nutzung wird weiterhin in unserem System erfasst.

2.  **Billing Administration:**
    * Unternehmenskonten können eine separate Kontaktperson für die Abrechnung haben.
    * Wir werden die Erstellung von Purchase Orders (Bestellungen) unterstützen.

---

### Integration

1.  **Accounting Systems:**
    * Eine Integration mit Buchhaltungssystemen ist für die mittelfristige Planung vorgesehen. Wir beginnen mit einer einfachen Exportfunktion, die eine `.csv`-Datei mit allen Rechnungen und Zahlungen generiert.

2.  **Analytics:**
    * Wir werden unsere eigenen internen Analyse-Tools nutzen, um KPIs wie Churn Rate, ARPU und Credit-Nutzung zu verfolgen.

---

### Limits and Quotas

1.  **Transaction Limits:**
    * Wir werden anfängliche Betragslimits festlegen (z. B. maximal 10.000 USD pro Transaktion), um Betrug zu verhindern. Die Überwachung von Stripe wird hier ebenfalls eine Rolle spielen.

2.  **Rate Limits:**
    * Das API Gateway wird ein Rate Limiting für unsere eigenen Billing-Endpoints vorsehen (z. B. maximal 10 Anfragen pro Minute), um eine Überlastung des Dienstes zu verhindern.

---

### Support

1.  **Dispute Handling:**
    * Bei Chargebacks wird der betroffene Account automatisch suspendiert. Der Support wird mit dem Kunden in Kontakt treten, um das Problem zu lösen.

2.  **Failed Payments:**
    * Nach 7 Tagen fehlgeschlagener Zahlungen wird der Account auf den Free-Plan umgestellt. Der Kunde wird per E-Mail benachrichtigt.

---

### Monitoring

1.  **Metrics:**
    * Wichtige Metriken sind: ARPU, Churn Rate, MRR (Monthly Recurring Revenue), Anzahl der aktiven Abonnements pro Stufe und die Verteilung der Kreditausgaben pro KI-Aktion.
2.  **Audit Trail:**
    * Jede finanzielle Transaktion, jede Änderung des Abonnements und jede Guthabengutschrift wird in einem unveränderlichen Audit-Log erfasst, das für Compliance-Zwecke aufbewahrt wird.