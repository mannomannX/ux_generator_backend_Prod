// ==========================================
// SERVICES/FLOW-SERVICE/src/services/versioning-service.js
// ==========================================
import { MongoClient } from '@ux-flow/common';

class VersioningService {
  constructor(logger, mongoClient) {
    this.logger = logger;
    this.mongoClient = mongoClient;
  }

  async createVersion(flowId, flowData, userId, description = null, session = null) {
    try {
      const db = this.mongoClient.getDb();
      const versionsCollection = db.collection('flow_versions');

      // Get current version count for this flow (use session if in transaction)
      const versionCount = await versionsCollection.countDocuments(
        { flowId },
        session ? { session } : {}
      );
      const versionNumber = versionCount + 1;

      // Create version document
      const version = {
        flowId,
        versionNumber,
        description: description || `Version ${versionNumber}`,
        flowData: JSON.parse(JSON.stringify(flowData)), // Deep clone
        createdBy: userId,
        createdAt: new Date(),
        size: JSON.stringify(flowData).length,
        metadata: {
          nodeCount: flowData.nodes?.length || 0,
          edgeCount: flowData.edges?.length || 0,
          flowVersion: flowData.metadata?.version || '1.0.0',
        },
      };

      const result = await versionsCollection.insertOne(
        version,
        session ? { session } : {}
      );
      const versionId = result.insertedId.toString();

      // Update flow with latest version reference
      const flowsCollection = db.collection('flows');
      await flowsCollection.updateOne(
        { _id: MongoClient.createObjectId(flowId) },
        {
          $set: {
            'metadata.latestVersionId': versionId,
            'metadata.versionCount': versionNumber,
          },
        },
        session ? { session } : {}
      );

      this.logger.info('Flow version created', {
        flowId,
        versionId,
        versionNumber,
        createdBy: userId,
        size: version.size,
      });

      return {
        versionId,
        versionNumber,
        createdAt: version.createdAt,
      };

    } catch (error) {
      this.logger.error('Failed to create flow version', error, { flowId, userId });
      throw error;
    }
  }

  async getVersions(flowId, options = {}) {
    try {
      const { page = 1, limit = 20, includeData = false } = options;

      const db = this.mongoClient.getDb();
      const versionsCollection = db.collection('flow_versions');

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Build projection
      const projection = {
        versionNumber: 1,
        description: 1,
        createdBy: 1,
        createdAt: 1,
        size: 1,
        metadata: 1,
      };

      if (includeData) {
        projection.flowData = 1;
      }

      const [versions, totalCount] = await Promise.all([
        versionsCollection
          .find({ flowId })
          .sort({ versionNumber: -1 }) // Latest first
          .skip(skip)
          .limit(parseInt(limit))
          .project(projection)
          .toArray(),
        versionsCollection.countDocuments({ flowId }),
      ]);

      const totalPages = Math.ceil(totalCount / parseInt(limit));

      return {
        versions: versions.map(version => ({
          ...version,
          id: version._id.toString(),
          _id: undefined,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      };

    } catch (error) {
      this.logger.error('Failed to get flow versions', error, { flowId });
      throw error;
    }
  }

  async getVersion(flowId, versionNumber) {
    try {
      const db = this.mongoClient.getDb();
      const versionsCollection = db.collection('flow_versions');

      const version = await versionsCollection.findOne({
        flowId,
        versionNumber: parseInt(versionNumber),
      });

      if (!version) {
        throw new Error(`Version ${versionNumber} not found for flow ${flowId}`);
      }

      return {
        ...version,
        id: version._id.toString(),
        _id: undefined,
      };

    } catch (error) {
      this.logger.error('Failed to get flow version', error, { flowId, versionNumber });
      throw error;
    }
  }

  async restoreVersion(flowId, versionNumber, userId) {
    try {
      // Get the version to restore
      const version = await this.getVersion(flowId, versionNumber);
      
      // Update the main flow with the version data
      const db = this.mongoClient.getDb();
      const flowsCollection = db.collection('flows');

      const restoredFlowData = {
        ...version.flowData,
        metadata: {
          ...version.flowData.metadata,
          lastModifiedBy: userId,
          updatedAt: new Date(),
          restoredFromVersion: versionNumber,
          restoredAt: new Date(),
        },
      };

      // Use transaction for atomic restore
      const session = this.mongoClient.getClient().startSession();
      
      try {
        await session.withTransaction(async () => {
          // Replace the flow
          await flowsCollection.replaceOne(
            { _id: MongoClient.createObjectId(flowId) },
            restoredFlowData,
            { session }
          );

          // Create a new version for this restoration
          await this.createVersion(
            flowId,
            restoredFlowData,
            userId,
            `Restored from version ${versionNumber}`,
            session
          );
        }, {
          readPreference: 'primary',
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority' },
          maxCommitTimeMS: 5000
        });
      } finally {
        await session.endSession();
      }

      this.logger.info('Flow version restored', {
        flowId,
        restoredVersion: versionNumber,
        restoredBy: userId,
      });

      return restoredFlowData;

    } catch (error) {
      this.logger.error('Failed to restore flow version', error, { flowId, versionNumber, userId });
      throw error;
    }
  }

  async compareVersions(flowId, versionA, versionB) {
    try {
      const [versionDataA, versionDataB] = await Promise.all([
        this.getVersion(flowId, versionA),
        this.getVersion(flowId, versionB),
      ]);

      const comparison = this.calculateDifferences(
        versionDataA.flowData,
        versionDataB.flowData
      );

      return {
        versionA: {
          number: versionA,
          createdAt: versionDataA.createdAt,
          createdBy: versionDataA.createdBy,
        },
        versionB: {
          number: versionB,
          createdAt: versionDataB.createdAt,
          createdBy: versionDataB.createdBy,
        },
        differences: comparison,
      };

    } catch (error) {
      this.logger.error('Failed to compare flow versions', error, { flowId, versionA, versionB });
      throw error;
    }
  }

  calculateDifferences(flowA, flowB) {
    const differences = {
      metadata: {},
      nodes: {
        added: [],
        removed: [],
        modified: [],
      },
      edges: {
        added: [],
        removed: [],
        modified: [],
      },
      summary: {
        totalChanges: 0,
        changeTypes: [],
      },
    };

    // Compare metadata
    if (flowA.metadata?.flowName !== flowB.metadata?.flowName) {
      differences.metadata.flowName = {
        from: flowA.metadata?.flowName,
        to: flowB.metadata?.flowName,
      };
    }

    // Compare nodes
    const nodesA = new Map(flowA.nodes?.map(node => [node.id, node]) || []);
    const nodesB = new Map(flowB.nodes?.map(node => [node.id, node]) || []);

    // Find added and modified nodes
    for (const [nodeId, nodeB] of nodesB) {
      if (!nodesA.has(nodeId)) {
        differences.nodes.added.push(nodeB);
      } else {
        const nodeA = nodesA.get(nodeId);
        const nodeDiff = this.compareNodes(nodeA, nodeB);
        if (nodeDiff.hasChanges) {
          differences.nodes.modified.push({
            id: nodeId,
            changes: nodeDiff.changes,
          });
        }
      }
    }

    // Find removed nodes
    for (const [nodeId, nodeA] of nodesA) {
      if (!nodesB.has(nodeId)) {
        differences.nodes.removed.push(nodeA);
      }
    }

    // Compare edges
    const edgesA = new Map(flowA.edges?.map(edge => [edge.id, edge]) || []);
    const edgesB = new Map(flowB.edges?.map(edge => [edge.id, edge]) || []);

    // Find added and modified edges
    for (const [edgeId, edgeB] of edgesB) {
      if (!edgesA.has(edgeId)) {
        differences.edges.added.push(edgeB);
      } else {
        const edgeA = edgesA.get(edgeId);
        const edgeDiff = this.compareEdges(edgeA, edgeB);
        if (edgeDiff.hasChanges) {
          differences.edges.modified.push({
            id: edgeId,
            changes: edgeDiff.changes,
          });
        }
      }
    }

    // Find removed edges
    for (const [edgeId, edgeA] of edgesA) {
      if (!edgesB.has(edgeId)) {
        differences.edges.removed.push(edgeA);
      }
    }

    // Calculate summary
    differences.summary.totalChanges = 
      differences.nodes.added.length +
      differences.nodes.removed.length +
      differences.nodes.modified.length +
      differences.edges.added.length +
      differences.edges.removed.length +
      differences.edges.modified.length +
      Object.keys(differences.metadata).length;

    if (differences.nodes.added.length > 0) differences.summary.changeTypes.push('nodes_added');
    if (differences.nodes.removed.length > 0) differences.summary.changeTypes.push('nodes_removed');
    if (differences.nodes.modified.length > 0) differences.summary.changeTypes.push('nodes_modified');
    if (differences.edges.added.length > 0) differences.summary.changeTypes.push('edges_added');
    if (differences.edges.removed.length > 0) differences.summary.changeTypes.push('edges_removed');
    if (differences.edges.modified.length > 0) differences.summary.changeTypes.push('edges_modified');
    if (Object.keys(differences.metadata).length > 0) differences.summary.changeTypes.push('metadata_changed');

    return differences;
  }

  compareNodes(nodeA, nodeB) {
    const changes = {};
    let hasChanges = false;

    if (nodeA.type !== nodeB.type) {
      changes.type = { from: nodeA.type, to: nodeB.type };
      hasChanges = true;
    }

    if (JSON.stringify(nodeA.position) !== JSON.stringify(nodeB.position)) {
      changes.position = { from: nodeA.position, to: nodeB.position };
      hasChanges = true;
    }

    if (JSON.stringify(nodeA.data) !== JSON.stringify(nodeB.data)) {
      changes.data = { from: nodeA.data, to: nodeB.data };
      hasChanges = true;
    }

    return { hasChanges, changes };
  }

  compareEdges(edgeA, edgeB) {
    const changes = {};
    let hasChanges = false;

    if (edgeA.source !== edgeB.source) {
      changes.source = { from: edgeA.source, to: edgeB.source };
      hasChanges = true;
    }

    if (edgeA.target !== edgeB.target) {
      changes.target = { from: edgeA.target, to: edgeB.target };
      hasChanges = true;
    }

    if (JSON.stringify(edgeA.data) !== JSON.stringify(edgeB.data)) {
      changes.data = { from: edgeA.data, to: edgeB.data };
      hasChanges = true;
    }

    return { hasChanges, changes };
  }

  async deleteVersions(flowId, keepVersions = 10) {
    try {
      const db = this.mongoClient.getDb();
      const versionsCollection = db.collection('flow_versions');

      // Get versions sorted by version number (latest first)
      const versions = await versionsCollection
        .find({ flowId })
        .sort({ versionNumber: -1 })
        .project({ _id: 1, versionNumber: 1 })
        .toArray();

      if (versions.length <= keepVersions) {
        return { deletedCount: 0, message: 'No versions to delete' };
      }

      // Keep the latest N versions, delete the rest
      const versionsToDelete = versions.slice(keepVersions);
      const versionIds = versionsToDelete.map(v => v._id);

      const result = await versionsCollection.deleteMany({
        _id: { $in: versionIds },
      });

      this.logger.info('Old flow versions deleted', {
        flowId,
        deletedCount: result.deletedCount,
        keptVersions: keepVersions,
      });

      return {
        deletedCount: result.deletedCount,
        deletedVersions: versionsToDelete.map(v => v.versionNumber),
      };

    } catch (error) {
      this.logger.error('Failed to delete old flow versions', error, { flowId });
      throw error;
    }
  }

  async getVersionStats(flowId) {
    try {
      const db = this.mongoClient.getDb();
      const versionsCollection = db.collection('flow_versions');

      const stats = await versionsCollection.aggregate([
        { $match: { flowId } },
        {
          $group: {
            _id: null,
            totalVersions: { $sum: 1 },
            totalSize: { $sum: '$size' },
            avgSize: { $avg: '$size' },
            latestVersion: { $max: '$versionNumber' },
            oldestVersion: { $min: '$versionNumber' },
            firstCreated: { $min: '$createdAt' },
            lastCreated: { $max: '$createdAt' },
          },
        },
      ]).toArray();

      if (stats.length === 0) {
        return {
          totalVersions: 0,
          totalSize: 0,
          avgSize: 0,
          latestVersion: 0,
          oldestVersion: 0,
          firstCreated: null,
          lastCreated: null,
        };
      }

      return {
        ...stats[0],
        _id: undefined,
      };

    } catch (error) {
      this.logger.error('Failed to get version stats', error, { flowId });
      throw error;
    }
  }
}

export { VersioningService };