// ==========================================
// PACKAGES/COMMON/src/database/index.js
// ==========================================
export { MongoClient } from './mongo-client.js';
export { RedisClient } from './redis-client.js';

// ChromaDB client will be implemented in knowledge-service
// as it's service-specific
export const ChromaClient = null; // Placeholder