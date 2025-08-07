#!/usr/bin/env node

// ==========================================
// SCRIPTS/init-database.js
// ==========================================

/**
 * Database initialization script for production deployment
 * Creates all necessary indexes for optimal query performance
 */

import { MongoClient, IndexManager, Logger } from '@ux-flow/common';
import config from '../packages/common/src/config/database.js';

class DatabaseInitializer {
  constructor() {
    this.logger = new Logger('database-initializer');
    this.mongoClient = new MongoClient(this.logger);
    this.indexManager = null;
  }

  async initialize() {
    try {
      this.logger.info('Starting database initialization...');
      
      // Connect to MongoDB
      await this.mongoClient.connect();
      this.logger.info('Connected to MongoDB successfully');
      
      // Initialize IndexManager
      this.indexManager = new IndexManager(this.mongoClient, this.logger);
      
      // Create all indexes
      await this.createIndexes();
      
      // Analyze existing indexes
      await this.analyzeIndexes();
      
      // Get index statistics
      await this.getStatistics();
      
      this.logger.info('Database initialization completed successfully');
      
    } catch (error) {
      this.logger.error('Database initialization failed', error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async createIndexes() {
    try {
      this.logger.info('Creating database indexes...');
      
      const result = await this.indexManager.initializeAllIndexes();
      
      if (result.success) {
        this.logger.info('All indexes created successfully', {
          totalCollections: result.totalCollections,
          totalIndexes: result.totalIndexes,
          createdIndexes: result.createdIndexes,
          duration: result.duration,
        });
      } else {
        this.logger.warn('Some indexes failed to create', {
          totalCollections: result.totalCollections,
          totalIndexes: result.totalIndexes,
          createdIndexes: result.createdIndexes,
          errors: result.errors,
          duration: result.duration,
        });
      }
      
    } catch (error) {
      this.logger.error('Failed to create indexes', error);
      throw error;
    }
  }

  async analyzeIndexes() {
    try {
      this.logger.info('Analyzing existing indexes...');
      
      const analysis = await this.indexManager.analyzeIndexes();
      
      this.logger.info('Index analysis completed', {
        totalCollections: Object.keys(analysis.collections).length,
        totalIndexes: analysis.totalIndexes,
        recommendations: analysis.recommendations.length,
        duplicateIndexes: analysis.duplicateIndexes.length,
      });
      
      // Log recommendations
      if (analysis.recommendations.length > 0) {
        this.logger.warn('Index recommendations found:');
        for (const recommendation of analysis.recommendations) {
          this.logger.warn(`[${recommendation.severity.toUpperCase()}] ${recommendation.collection}: ${recommendation.message}`);
        }
      }
      
      // Log duplicates
      if (analysis.duplicateIndexes.length > 0) {
        this.logger.warn('Duplicate indexes found:', analysis.duplicateIndexes);
      }
      
      return analysis;
      
    } catch (error) {
      this.logger.error('Index analysis failed', error);
      // Don't throw, this is not critical
    }
  }

  async getStatistics() {
    try {
      this.logger.info('Gathering index statistics...');
      
      const stats = await this.indexManager.getIndexStats();
      
      this.logger.info('Index statistics:', {
        totalCollections: stats.totalCollections,
        totalIndexes: stats.totalIndexes,
        totalIndexSize: this.formatBytes(stats.indexSize),
        averageIndexesPerCollection: Math.round(stats.totalIndexes / stats.totalCollections),
      });
      
      // Log top collections by index count
      const sortedCollections = Object.entries(stats.collections)
        .sort(([,a], [,b]) => b.indexCount - a.indexCount)
        .slice(0, 5);
      
      this.logger.info('Top collections by index count:');
      for (const [name, stats] of sortedCollections) {
        this.logger.info(`  ${name}: ${stats.indexCount} indexes, ${this.formatBytes(stats.indexSize)} size`);
      }
      
      return stats;
      
    } catch (error) {
      this.logger.error('Failed to get index statistics', error);
      // Don't throw, this is not critical
    }
  }

  async initializeServiceIndexes(serviceName) {
    try {
      this.logger.info(`Initializing indexes for service: ${serviceName}`);
      
      const result = await this.indexManager.createServiceIndexes(serviceName);
      
      this.logger.info(`Service indexes created for ${serviceName}`, result);
      
      return result;
      
    } catch (error) {
      this.logger.error(`Failed to create indexes for service ${serviceName}`, error);
      throw error;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async cleanup() {
    try {
      if (this.mongoClient) {
        await this.mongoClient.disconnect();
        this.logger.info('Disconnected from MongoDB');
      }
    } catch (error) {
      this.logger.error('Cleanup failed', error);
    }
  }
}

// CLI functionality
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const serviceName = args[1];
  
  const initializer = new DatabaseInitializer();
  
  switch (command) {
    case 'init':
      await initializer.initialize();
      break;
      
    case 'service':
      if (!serviceName) {
        console.error('Service name is required. Usage: node init-database.js service <service-name>');
        process.exit(1);
      }
      await initializer.mongoClient.connect();
      initializer.indexManager = new IndexManager(initializer.mongoClient, initializer.logger);
      await initializer.initializeServiceIndexes(serviceName);
      await initializer.cleanup();
      break;
      
    case 'analyze':
      await initializer.mongoClient.connect();
      initializer.indexManager = new IndexManager(initializer.mongoClient, initializer.logger);
      await initializer.analyzeIndexes();
      await initializer.cleanup();
      break;
      
    case 'stats':
      await initializer.mongoClient.connect();
      initializer.indexManager = new IndexManager(initializer.mongoClient, initializer.logger);
      await initializer.getStatistics();
      await initializer.cleanup();
      break;
      
    default:
      console.log(`
Usage: node init-database.js <command> [options]

Commands:
  init              Initialize all database indexes
  service <name>    Initialize indexes for a specific service
  analyze           Analyze existing indexes and provide recommendations
  stats             Show index statistics

Services:
  flow-service
  user-management
  billing-service
  knowledge-service
  cognitive-core
  common

Examples:
  node init-database.js init
  node init-database.js service flow-service
  node init-database.js analyze
  node init-database.js stats
      `);
      process.exit(0);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

export { DatabaseInitializer };
export default DatabaseInitializer;