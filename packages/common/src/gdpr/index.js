const DataProtection = require('./data-protection');
const ConsentManager = require('./consent-manager');
const AuditLogger = require('./audit-logger');
const RightsHandler = require('./rights-handler');

module.exports = {
  DataProtection,
  ConsentManager,
  AuditLogger,
  RightsHandler
};