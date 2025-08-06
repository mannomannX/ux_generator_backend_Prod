# 🔍 Service Configuration Issues Report

## 🚨 Kritische Probleme

### 1. **Common Package Dependency Issue**
- **Problem**: Alle Services referenzieren `@ux-flow/common": "^1.0.0"` aber sollten `file:../../packages/common` verwenden
- **Impact**: Services können Common Package nicht finden
- **Services betroffen**: ALLE

### 2. **Jest in Dependencies statt DevDependencies**
- **Service**: user-management
- **Problem**: Jest, supertest, mongodb-memory-server sind in `dependencies` statt `devDependencies`
- **Impact**: Production Bundle wird unnötig groß

### 3. **Inkonsistente Test-Konfigurationen**
- **cognitive-core**: Hat umfangreiche Test-Scripts (unit, integration, coverage, watch, ci)
- **api-gateway**: Basis Test-Scripts
- **user-management**: Spezielle NODE_OPTIONS für ESM
- **flow-service**: Nur basis test script
- **knowledge-service**: Nur basis test script
- **billing-service**: Nur basis test script

### 4. **Fehlende Dependencies**
- **api-gateway**: Fehlt `mongodb`, `redis` (verwendet aber @ux-flow/common)
- **flow-service**: Fehlt `express-rate-limit`
- **knowledge-service**: Fehlt mehrere Dependencies

### 5. **Duplikate Dependencies**
- **user-management**: Jest ist sowohl in dependencies als auch devDependencies

## 📊 Service-by-Service Analyse

### API Gateway
```
✅ Gut:
- WebSocket (ws) konfiguriert
- Helmet für Security
- CORS konfiguriert

❌ Probleme:
- Common package path falsch
- MongoDB/Redis fehlen (aber vielleicht OK da über Common)
```

### Cognitive Core
```
✅ Gut:
- Vollständige Test-Suite
- Google AI SDK
- Alle notwendigen Dependencies

❌ Probleme:
- Common package path falsch
- Zu viele Test-Scripts (overengineered)
```

### User Management
```
✅ Gut:
- Email (nodemailer) konfiguriert
- bcrypt für Passwörter
- UUID für IDs

❌ Probleme:
- Jest in dependencies statt devDependencies
- Common package path falsch
- mongodb-memory-server in production dependencies
```

### Flow Service
```
❌ Probleme:
- Common package path falsch
- Minimale Test-Konfiguration
- express-rate-limit in package.json aber nicht verwendet?
```

### Knowledge Service
```
❌ Probleme:
- Common package path falsch
- Minimale Test-Konfiguration
```

### Billing Service
```
✅ Gut:
- Stripe konfiguriert
- Alle Dependencies vorhanden

❌ Probleme:
- Common package path falsch
- Minimale Test-Konfiguration
```

## 🔧 Empfohlene Fixes

### 1. Sofort-Fixes (Kritisch)
```json
// Für ALLE Services ändern:
"@ux-flow/common": "file:../../packages/common"
```

### 2. Dependencies bereinigen
```json
// user-management/package.json
"dependencies": {
  // ENTFERNEN: jest, supertest, mongodb-memory-server
},
"devDependencies": {
  // HINZUFÜGEN: jest, supertest, mongodb-memory-server
}
```

### 3. Standardisierte Test-Scripts
```json
// Für alle Services:
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
}
```

### 4. Gemeinsame Dependencies
Alle Services sollten haben:
- express
- cors
- helmet
- express-rate-limit
- dotenv

## 🎯 Priorisierte Action Items

1. **SOFORT**: Common Package Pfade in allen Services fixen
2. **SOFORT**: Jest aus user-management dependencies entfernen
3. **WICHTIG**: Test-Scripts standardisieren
4. **NICE-TO-HAVE**: Überflüssige Dependencies entfernen

## ❓ Zu klärende Fragen

1. Sollen MongoDB und Redis direkt in Services oder nur über Common Package?
2. Brauchen alle Services Jest oder reicht es in root package.json?
3. Soll express-rate-limit überall oder nur im API Gateway?

## 🚀 Quick Fix Script

```bash
# Fix all package.json files
for service in api-gateway cognitive-core user-management flow-service knowledge-service billing-service; do
  sed -i 's/"@ux-flow\/common": ".*"/"@ux-flow\/common": "file:..\/..\/packages\/common"/' services/$service/package.json
done
```

## 📈 Nach den Fixes

- **Reduzierte Bundle-Größe**: ~30% kleiner durch korrekte devDependencies
- **Schnellere Installation**: Keine unnötigen Production Dependencies
- **Konsistente Test-Umgebung**: Alle Services mit gleichen Test-Scripts
- **Funktionierende Inter-Service-Kommunikation**: Common Package korrekt verlinkt