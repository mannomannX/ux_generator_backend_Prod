### User Management Service - Antworten auf offene Fragen

**Zusammenfassung:** Die Strategie für das `user-management` ist es, eine sichere, flexible und skalierbare Grundlage zu schaffen. Wir werden branchenübliche Standards für die Sicherheit anwenden, eine anpassbare Architektur für Unternehmenskunden schaffen und den Fokus auf eine nahtlose, reibungslose Benutzererfahrung legen.

---

### Authentication Strategy

1.  **Session Management:**
    * **Dauer:** Die Session-Dauer wird durch die JWT-Token-Rotation gesteuert. Der Access Token hat eine kurze Lebensdauer (z. B. 15 Minuten), während der Refresh Token eine längere (z. B. 7 Tage) hat.
    * **Limits:** Wir werden eine Begrenzung von **5 gleichzeitigen Sessions pro Nutzer** festlegen, um die Sicherheit zu erhöhen. Jede weitere Session führt dazu, dass die älteste Session ungültig wird.
    * **Invalidierung:** Die Session wird automatisch ungültig, wenn das Passwort geändert wird.
    * **"Remember me":** Die "Remember me"-Funktion verlängert die Lebensdauer des Refresh Tokens auf 30 Tage.

2.  **OAuth Providers:**
    * Wir starten mit **Google und GitHub** als primäre OAuth-Anbieter, da sie in unserem Zielmarkt am weitesten verbreitet sind.
    * Das Account-Linking wird als optionales Feature angeboten, bei dem ein Nutzer seinen bestehenden Account mit einem OAuth-Provider verbinden kann.

3.  **SSO/SAML:**
    * Die Unterstützung für **SAML 2.0** ist für unsere Enterprise-Kunden ein Muss. Wir priorisieren die Integration mit **Okta und Azure AD**.
    * Wir werden **Just-In-Time (JIT)**-Provisioning unterstützen, um die Verwaltung von Nutzern in großen Unternehmen zu vereinfachen.

---

### Security Policies

1.  **Password Requirements:**
    * **Länge:** Minimum **12 Zeichen**.
    * **Komplexität:** Muss Groß- und Kleinbuchstaben, Zahlen und Sonderzeichen enthalten.
    * **Verlauf:** Die letzten **10 Passwörter** dürfen nicht wiederverwendet werden.

2.  **Account Lockout:**
    * **Grenzwert:** Nach **5 fehlgeschlagenen Anmeldeversuchen** wird der Account für **15 Minuten** gesperrt.
    * **Typ:** Die Sperrung ist **Account-basiert**, um legitime Nutzer nicht zu behindern.
    * **Sperrdauer:** Die Dauer der Sperre wird bei wiederholten Versuchen exponentiell erhöht (z. B. 15 Minuten, 30 Minuten, 1 Stunde).

3.  **Two-Factor Authentication:**
    * 2FA ist für Administratoren und Workspace-Inhaber **verpflichtend** und für alle anderen Nutzer optional.
    * Wir unterstützen **TOTP-Methoden** (z. B. Google Authenticator) und **E-Mail-Verifizierung** als Fallback.

---

### User Management

1.  **User Roles:**
    * **Hierarchie:** Wir verwenden die definierte Hierarchie: `super_admin` > `admin` > `user`.
    * **Granularität:** Berechtigungen werden auf Workspace-Ebene verwaltet, um eine flexible Kontrolle zu ermöglichen.

2.  **User Lifecycle:**
    * **Verifizierung:** Die E-Mail-Verifizierung ist standardmäßig **obligatorisch**.
    * **Löschung:** Wir verwenden einen **Soft-Delete**-Ansatz, bei dem das Konto zunächst inaktiv gesetzt wird. Eine endgültige Löschung erfolgt nach **30 Tagen**, um dem Nutzer die Möglichkeit zu geben, seine Meinung zu ändern.

3.  **Profile Management:**
    * **Pflichtfelder:** Nur `E-Mail` und `Passwort` sind obligatorisch. Alle anderen Felder sind optional.
    * **Avatar:** Wir unterstützen die Verwendung von Avataren. Standardmäßig wird ein Gravatar-Dienst verwendet, Nutzer können aber auch eigene Bilder hochladen.

---

### Workspace Management

1.  **Workspace Structure:**
    * **Nutzer:** Wir setzen ein Soft-Limit von **10 Nutzern im Free-Tier**, das für Pro- und Enterprise-Kunden erweiterbar ist.
    * **Hierarchie:** Wir unterstützen keine verschachtelten Workspaces, um die Komplexität zu reduzieren.
    * **Zusammenarbeit:** Nutzer können zu mehreren Workspaces gehören.

2.  **Permissions:**
    * Wir implementieren **vier Rollen** auf Workspace-Ebene: `owner`, `admin`, `member` und `viewer`, mit klar definierten Rechten.

3.  **Billing Integration:**
    * Die Abrechnung ist **pro Workspace** und wird vom Workspace-Inhaber verwaltet.
    * Wir bieten eine Lizenzierung pro Benutzer an (`user seat licensing`).

---

### Compliance & Privacy

1.  **GDPR Compliance:**
    * Das "Recht auf Vergessenwerden" wird durch unsere Soft- und Hard-Delete-Strategie umgesetzt.
    * Nutzer können ihre Daten jederzeit im **JSON- oder CSV-Format** exportieren.
    * Wir werden eine **Datenverarbeitungsvereinbarung (DPA)** für Unternehmenskunden bereitstellen.

2.  **Audit & Logging:**
    * Wir protokollieren alle sicherheitskritischen Ereignisse, wie z. B. Anmeldungen, Passwortänderungen, Rollenänderungen und Datenexporte.
    * Audit-Protokolle werden für **90 Tage** aufbewahrt und sind nur für Administratoren zugänglich.

---

### Integration Points

1.  **Email Service:**
    * Wir verwenden **Amazon SES (Simple Email Service)** als E-Mail-Anbieter, da es eine hohe Zuverlässigkeit, gute Zustellbarkeit und Skalierbarkeit bietet.

2.  **Analytics Integration:**
    * Wir werden ein **anonymisiertes, zustimmungsbasiertes Tracking** mit einem Analytics-Dienst wie Mixpanel oder Amplitude implementieren.

3.  **Externe Systeme:**
    * Die Integration mit externen Systemen wird über unsere **API-Keys** oder eine OAuth-basierte API-Schnittstelle ermöglicht.

---

### Performance & Scaling

1.  **Load Expectations:**
    * Wir planen, in der ersten Phase bis zu **100.000 Nutzer** zu unterstützen.
    * **Redis** wird für das Session-Management und das Caching von Nutzer- und Workspace-Daten verwendet, um die Datenbanklast zu reduzieren.

2.  **Datenbankstrategie:**
    * Wir setzen auf eine **Sharding-Strategie** in der MongoDB, um das System zu skalieren, sobald die Datenmenge wächst.

---

### User Experience

1.  **Onboarding:**
    * Das Onboarding wird eine geführte Erfahrung sein, die mit einer Begrüßungs-E-Mail beginnt und mit einer kurzen Tour durch die wichtigsten Funktionen endet.

2.  **Account Recovery:**
    * Wir verwenden zeitlich begrenzte, sichere Tokens für die Wiederherstellung des Passworts. Das Token läuft nach **einer Stunde** ab.
    * Wir bieten keine Sicherheitsfragen an, da diese als unsicher gelten.

3.  **Benachrichtigungen:**
    * Der Nutzer wird bei Anmeldungen von einem unbekannten Gerät per E-Mail benachrichtigt, um verdächtige Aktivitäten zu erkennen.

---

### API & Developer Experience

1.  **API Access:**
    * API-Keys werden über das Benutzerprofil verwaltet und können rotiert werden. Sie sind für den programmatischen Zugriff auf die API vorgesehen.

2.  **Webhooks:**
    * Wir bieten Webhooks an, um externe Systeme (z. B. Slack) über wichtige Ereignisse (z. B. `USER_REGISTERED`) zu informieren. Die Webhooks können im Admin-Bereich verwaltet werden.

---

### Monitoring & Alerts

1.  **Sicherheitsüberwachung:**
    * Wir werden ein System zur Erkennung verdächtiger Aktivitäten (z. B. zu viele fehlgeschlagene Anmeldeversuche) einrichten, das sofort einen Alarm auslöst.

2.  **Performance Monitoring:**
    * Wir überwachen die Latenz der Authentifizierungsanfragen und die Häufigkeit von Fehlern, um die Leistung des Services zu gewährleisten.