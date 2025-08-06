const EventEmitter = require('events');

class CostOptimizer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      cloudProvider: config.cloudProvider || 'aws',
      region: config.region || 'us-east-1',
      targetUtilization: config.targetUtilization || 0.7,
      scaleDownThreshold: config.scaleDownThreshold || 0.3,
      scaleUpThreshold: config.scaleUpThreshold || 0.8,
      costThreshold: config.costThreshold || 1000, // Monthly budget
      enableSpotInstances: config.enableSpotInstances !== false,
      enableAutoScaling: config.enableAutoScaling !== false,
      enableScheduledScaling: config.enableScheduledScaling !== false,
      ...config
    };
    
    this.metrics = new Map();
    this.recommendations = [];
    this.savings = {
      potential: 0,
      realized: 0
    };
  }

  // Analyze current infrastructure costs
  async analyzeCurrentCosts() {
    const analysis = {
      timestamp: new Date().toISOString(),
      totalCost: 0,
      breakdown: {},
      unutilizedResources: [],
      overProvisionedResources: [],
      recommendations: []
    };
    
    // Analyze compute costs
    const computeAnalysis = await this.analyzeComputeCosts();
    analysis.breakdown.compute = computeAnalysis;
    analysis.totalCost += computeAnalysis.cost;
    
    // Analyze storage costs
    const storageAnalysis = await this.analyzeStorageCosts();
    analysis.breakdown.storage = storageAnalysis;
    analysis.totalCost += storageAnalysis.cost;
    
    // Analyze network costs
    const networkAnalysis = await this.analyzeNetworkCosts();
    analysis.breakdown.network = networkAnalysis;
    analysis.totalCost += networkAnalysis.cost;
    
    // Analyze database costs
    const databaseAnalysis = await this.analyzeDatabaseCosts();
    analysis.breakdown.database = databaseAnalysis;
    analysis.totalCost += databaseAnalysis.cost;
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);
    
    return analysis;
  }

  // Analyze compute costs
  async analyzeComputeCosts() {
    const analysis = {
      cost: 0,
      instances: [],
      utilization: {},
      recommendations: []
    };
    
    // Get instance metrics
    const instances = await this.getInstanceMetrics();
    
    for (const instance of instances) {
      const instanceCost = this.calculateInstanceCost(instance);
      analysis.cost += instanceCost;
      
      analysis.instances.push({
        id: instance.id,
        type: instance.type,
        cost: instanceCost,
        utilization: instance.utilization,
        runtime: instance.runtime
      });
      
      // Check for optimization opportunities
      if (instance.utilization.cpu < this.config.scaleDownThreshold) {
        analysis.recommendations.push({
          type: 'downsize',
          instance: instance.id,
          currentType: instance.type,
          recommendedType: this.getSmallermultiEdit,InstanceType(instance.type),
          potentialSavings: instanceCost * 0.3
        });
      }
      
      // Check for spot instance eligibility
      if (!instance.isSpot && this.config.enableSpotInstances) {
        analysis.recommendations.push({
          type: 'spot_instance',
          instance: instance.id,
          potentialSavings: instanceCost * 0.7
        });
      }
    }
    
    return analysis;
  }

  // Analyze storage costs
  async analyzeStorageCosts() {
    const analysis = {
      cost: 0,
      volumes: [],
      snapshots: [],
      recommendations: []
    };
    
    // Analyze EBS volumes
    const volumes = await this.getVolumeMetrics();
    
    for (const volume of volumes) {
      const volumeCost = this.calculateStorageCost(volume);
      analysis.cost += volumeCost;
      
      analysis.volumes.push({
        id: volume.id,
        size: volume.size,
        type: volume.type,
        cost: volumeCost,
        utilization: volume.utilization
      });
      
      // Check for optimization
      if (volume.utilization < 0.5) {
        analysis.recommendations.push({
          type: 'reduce_storage',
          volume: volume.id,
          currentSize: volume.size,
          recommendedSize: Math.ceil(volume.size * volume.utilization),
          potentialSavings: volumeCost * (1 - volume.utilization)
        });
      }
      
      // Check for gp3 migration (AWS specific)
      if (volume.type === 'gp2') {
        analysis.recommendations.push({
          type: 'migrate_to_gp3',
          volume: volume.id,
          potentialSavings: volumeCost * 0.2
        });
      }
    }
    
    // Analyze snapshots
    const snapshots = await this.getSnapshotMetrics();
    
    for (const snapshot of snapshots) {
      const snapshotCost = this.calculateSnapshotCost(snapshot);
      analysis.cost += snapshotCost;
      
      // Check for old snapshots
      const age = Date.now() - new Date(snapshot.createdAt).getTime();
      const daysOld = age / (24 * 60 * 60 * 1000);
      
      if (daysOld > 30) {
        analysis.recommendations.push({
          type: 'delete_old_snapshot',
          snapshot: snapshot.id,
          age: daysOld,
          potentialSavings: snapshotCost
        });
      }
    }
    
    return analysis;
  }

  // Analyze network costs
  async analyzeNetworkCosts() {
    const analysis = {
      cost: 0,
      dataTransfer: {},
      loadBalancers: [],
      recommendations: []
    };
    
    // Analyze data transfer
    const transferMetrics = await this.getDataTransferMetrics();
    
    analysis.dataTransfer = {
      inbound: transferMetrics.inbound,
      outbound: transferMetrics.outbound,
      interRegion: transferMetrics.interRegion,
      cost: this.calculateDataTransferCost(transferMetrics)
    };
    
    analysis.cost += analysis.dataTransfer.cost;
    
    // Optimize data transfer
    if (transferMetrics.interRegion > 100) { // GB
      analysis.recommendations.push({
        type: 'reduce_inter_region',
        currentTransfer: transferMetrics.interRegion,
        suggestion: 'Use CDN or replicate data to reduce inter-region transfer',
        potentialSavings: transferMetrics.interRegion * 0.02 // $0.02/GB
      });
    }
    
    // Analyze load balancers
    const loadBalancers = await this.getLoadBalancerMetrics();
    
    for (const lb of loadBalancers) {
      const lbCost = this.calculateLoadBalancerCost(lb);
      analysis.cost += lbCost;
      
      analysis.loadBalancers.push({
        id: lb.id,
        type: lb.type,
        cost: lbCost,
        requestCount: lb.requestCount
      });
      
      // Check for idle load balancers
      if (lb.requestCount < 1000) {
        analysis.recommendations.push({
          type: 'remove_idle_lb',
          loadBalancer: lb.id,
          potentialSavings: lbCost
        });
      }
    }
    
    return analysis;
  }

  // Analyze database costs
  async analyzeDatabaseCosts() {
    const analysis = {
      cost: 0,
      instances: [],
      backups: [],
      recommendations: []
    };
    
    // Analyze RDS instances
    const dbInstances = await this.getDatabaseMetrics();
    
    for (const db of dbInstances) {
      const dbCost = this.calculateDatabaseCost(db);
      analysis.cost += dbCost;
      
      analysis.instances.push({
        id: db.id,
        engine: db.engine,
        instanceClass: db.instanceClass,
        storage: db.storage,
        cost: dbCost,
        utilization: db.utilization
      });
      
      // Check for Reserved Instance opportunities
      if (!db.isReserved && db.runtime > 30 * 24) { // Running for > 30 days
        analysis.recommendations.push({
          type: 'reserved_instance',
          database: db.id,
          potentialSavings: dbCost * 0.4
        });
      }
      
      // Check for read replica optimization
      if (db.readReplicas > 0 && db.utilization.read < 0.3) {
        analysis.recommendations.push({
          type: 'reduce_read_replicas',
          database: db.id,
          currentReplicas: db.readReplicas,
          recommendedReplicas: Math.max(1, Math.floor(db.readReplicas * 0.5)),
          potentialSavings: dbCost * 0.2
        });
      }
    }
    
    return analysis;
  }

  // Implement auto-scaling policies
  async implementAutoScaling() {
    const policies = [];
    
    // CPU-based scaling
    policies.push({
      name: 'cpu-scaling',
      metric: 'CPUUtilization',
      targetValue: this.config.targetUtilization * 100,
      scaleUpThreshold: this.config.scaleUpThreshold * 100,
      scaleDownThreshold: this.config.scaleDownThreshold * 100,
      cooldown: 300
    });
    
    // Memory-based scaling
    policies.push({
      name: 'memory-scaling',
      metric: 'MemoryUtilization',
      targetValue: this.config.targetUtilization * 100,
      scaleUpThreshold: 80,
      scaleDownThreshold: 30,
      cooldown: 300
    });
    
    // Request-based scaling
    policies.push({
      name: 'request-scaling',
      metric: 'RequestCountPerTarget',
      targetValue: 1000,
      scaleUpThreshold: 1500,
      scaleDownThreshold: 500,
      cooldown: 180
    });
    
    // Schedule-based scaling
    if (this.config.enableScheduledScaling) {
      policies.push({
        name: 'scheduled-scaling',
        schedule: [
          { cron: '0 9 * * MON-FRI', minCapacity: 5, maxCapacity: 20 }, // Business hours
          { cron: '0 18 * * MON-FRI', minCapacity: 2, maxCapacity: 10 }, // After hours
          { cron: '0 0 * * SAT,SUN', minCapacity: 1, maxCapacity: 5 } // Weekends
        ]
      });
    }
    
    return policies;
  }

  // Implement spot instance strategy
  async implementSpotStrategy() {
    const strategy = {
      enabled: this.config.enableSpotInstances,
      diversification: {
        instanceTypes: ['t3.medium', 't3.large', 't3a.medium', 't3a.large'],
        availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
        maxPrice: 'on-demand-price' // Never pay more than on-demand
      },
      fallbackToOnDemand: true,
      interruptionHandling: {
        drainTime: 120, // seconds
        checkpointData: true,
        gracefulShutdown: true
      },
      allocation: {
        baseCapacity: 0.3, // 30% on-demand for stability
        spotCapacity: 0.7  // 70% spot for cost savings
      }
    };
    
    return strategy;
  }

  // Implement caching strategy
  async implementCachingStrategy() {
    const strategy = {
      cdn: {
        enabled: true,
        provider: 'cloudflare',
        cacheRules: [
          { path: '/static/*', ttl: 86400 }, // 1 day
          { path: '/api/public/*', ttl: 300 }, // 5 minutes
          { path: '/images/*', ttl: 604800 } // 1 week
        ]
      },
      redis: {
        enabled: true,
        evictionPolicy: 'allkeys-lru',
        maxMemory: '2gb',
        ttl: {
          session: 3600, // 1 hour
          apiCache: 300, // 5 minutes
          queryCache: 600 // 10 minutes
        }
      },
      applicationCache: {
        enabled: true,
        strategies: [
          { type: 'memory', maxSize: '100mb' },
          { type: 'disk', maxSize: '1gb' }
        ]
      }
    };
    
    return strategy;
  }

  // Implement resource tagging strategy
  async implementTaggingStrategy() {
    const tags = {
      mandatory: [
        { key: 'Environment', values: ['production', 'staging', 'development'] },
        { key: 'Team', values: ['backend', 'frontend', 'devops'] },
        { key: 'CostCenter', values: ['engineering', 'product', 'operations'] },
        { key: 'Project', values: ['ux-flow-engine'] },
        { key: 'Owner', values: ['email@example.com'] }
      ],
      automated: [
        { key: 'CreatedAt', value: 'timestamp' },
        { key: 'CreatedBy', value: 'user-id' },
        { key: 'ManagedBy', value: 'terraform|manual' },
        { key: 'LastModified', value: 'timestamp' }
      ],
      costAllocation: [
        { key: 'BillingGroup', values: ['compute', 'storage', 'network', 'database'] },
        { key: 'Lifecycle', values: ['permanent', 'temporary', 'ephemeral'] }
      ]
    };
    
    return tags;
  }

  // Calculate potential savings
  calculatePotentialSavings(recommendations) {
    let totalSavings = 0;
    const savingsByType = {};
    
    for (const rec of recommendations) {
      totalSavings += rec.potentialSavings || 0;
      
      if (!savingsByType[rec.type]) {
        savingsByType[rec.type] = 0;
      }
      savingsByType[rec.type] += rec.potentialSavings || 0;
    }
    
    return {
      total: totalSavings,
      monthly: totalSavings,
      annual: totalSavings * 12,
      byType: savingsByType,
      percentageOfCurrentCost: (totalSavings / this.getCurrentMonthlyCost()) * 100
    };
  }

  // Generate cost optimization report
  generateOptimizationReport() {
    return {
      timestamp: new Date().toISOString(),
      currentCosts: {
        monthly: this.getCurrentMonthlyCost(),
        annual: this.getCurrentMonthlyCost() * 12
      },
      optimizedCosts: {
        monthly: this.getOptimizedMonthlyCost(),
        annual: this.getOptimizedMonthlyCost() * 12
      },
      savings: this.savings,
      recommendations: this.recommendations,
      implementedOptimizations: this.getImplementedOptimizations(),
      nextSteps: this.getNextSteps()
    };
  }

  // Monitor cost anomalies
  async monitorCostAnomalies() {
    const anomalies = [];
    const threshold = this.config.costThreshold;
    
    // Check for sudden cost increases
    const currentCost = this.getCurrentMonthlyCost();
    const previousCost = this.getPreviousMonthlyCost();
    
    if (currentCost > previousCost * 1.2) {
      anomalies.push({
        type: 'cost_spike',
        severity: 'high',
        increase: currentCost - previousCost,
        percentage: ((currentCost - previousCost) / previousCost) * 100
      });
    }
    
    // Check for exceeding budget
    if (currentCost > threshold) {
      anomalies.push({
        type: 'budget_exceeded',
        severity: 'critical',
        amount: currentCost - threshold,
        percentage: ((currentCost - threshold) / threshold) * 100
      });
    }
    
    // Check for unused resources
    const unusedResources = await this.findUnusedResources();
    if (unusedResources.length > 0) {
      anomalies.push({
        type: 'unused_resources',
        severity: 'medium',
        resources: unusedResources,
        wastage: this.calculateWastage(unusedResources)
      });
    }
    
    return anomalies;
  }

  // Implement cost alerts
  setupCostAlerts() {
    const alerts = [
      {
        name: 'budget_alert',
        threshold: this.config.costThreshold * 0.8,
        action: 'email',
        recipients: ['devops@example.com']
      },
      {
        name: 'anomaly_alert',
        threshold: 'auto', // ML-based detection
        action: 'slack',
        channel: '#cost-alerts'
      },
      {
        name: 'daily_report',
        schedule: '0 9 * * *',
        action: 'report',
        recipients: ['team@example.com']
      }
    ];
    
    return alerts;
  }

  // Resource rightsizing recommendations
  async getRightsizingRecommendations() {
    const recommendations = [];
    const instances = await this.getInstanceMetrics();
    
    for (const instance of instances) {
      const utilization = instance.utilization;
      
      // Check CPU utilization
      if (utilization.cpu < 0.2) {
        recommendations.push({
          resource: instance.id,
          type: 'downsize',
          reason: 'Low CPU utilization',
          current: instance.type,
          recommended: this.getSmallerInstanceType(instance.type),
          savingsEstimate: this.calculateInstanceCost(instance) * 0.5
        });
      }
      
      // Check memory utilization
      if (utilization.memory < 0.3) {
        recommendations.push({
          resource: instance.id,
          type: 'reduce_memory',
          reason: 'Low memory utilization',
          current: instance.memory,
          recommended: Math.ceil(instance.memory * 0.5),
          savingsEstimate: this.calculateInstanceCost(instance) * 0.3
        });
      }
      
      // Check for better instance family
      const betterFamily = this.getBetterInstanceFamily(instance);
      if (betterFamily) {
        recommendations.push({
          resource: instance.id,
          type: 'change_family',
          reason: 'Better price/performance ratio available',
          current: instance.type,
          recommended: betterFamily,
          savingsEstimate: this.calculateInstanceCost(instance) * 0.2
        });
      }
    }
    
    return recommendations;
  }

  // Implement reserved capacity planning
  async planReservedCapacity() {
    const plan = {
      compute: {
        currentOnDemand: 0,
        recommendedReserved: 0,
        savingsEstimate: 0
      },
      database: {
        currentOnDemand: 0,
        recommendedReserved: 0,
        savingsEstimate: 0
      },
      recommendations: []
    };
    
    // Analyze compute instances
    const instances = await this.getInstanceMetrics();
    const stableInstances = instances.filter(i => i.runtime > 30 * 24 * 60 * 60 * 1000);
    
    plan.compute.currentOnDemand = instances.length;
    plan.compute.recommendedReserved = stableInstances.length;
    plan.compute.savingsEstimate = stableInstances.reduce((sum, i) => 
      sum + this.calculateInstanceCost(i) * 0.4, 0
    );
    
    // Generate purchase recommendations
    const instanceTypes = {};
    stableInstances.forEach(i => {
      instanceTypes[i.type] = (instanceTypes[i.type] || 0) + 1;
    });
    
    for (const [type, count] of Object.entries(instanceTypes)) {
      plan.recommendations.push({
        type: 'reserved_instance',
        instanceType: type,
        count,
        term: '1year',
        paymentOption: 'partial_upfront',
        savingsEstimate: this.calculateRISavings(type, count)
      });
    }
    
    return plan;
  }

  // Helper methods
  getInstanceMetrics() {
    // Mock implementation - would connect to cloud provider API
    return Promise.resolve([]);
  }

  getVolumeMetrics() {
    return Promise.resolve([]);
  }

  getSnapshotMetrics() {
    return Promise.resolve([]);
  }

  getDataTransferMetrics() {
    return Promise.resolve({
      inbound: 0,
      outbound: 0,
      interRegion: 0
    });
  }

  getLoadBalancerMetrics() {
    return Promise.resolve([]);
  }

  getDatabaseMetrics() {
    return Promise.resolve([]);
  }

  calculateInstanceCost(instance) {
    // Simplified cost calculation
    const hourlyRates = {
      't3.micro': 0.0104,
      't3.small': 0.0208,
      't3.medium': 0.0416,
      't3.large': 0.0832,
      't3.xlarge': 0.1664
    };
    
    const rate = hourlyRates[instance.type] || 0.1;
    return rate * 24 * 30; // Monthly cost
  }

  calculateStorageCost(volume) {
    const gbRate = 0.10; // $0.10 per GB per month
    return volume.size * gbRate;
  }

  calculateSnapshotCost(snapshot) {
    const gbRate = 0.05; // $0.05 per GB per month
    return snapshot.size * gbRate;
  }

  calculateDataTransferCost(metrics) {
    return metrics.outbound * 0.09; // $0.09 per GB
  }

  calculateLoadBalancerCost(lb) {
    return 18.0; // Simplified: $18/month
  }

  calculateDatabaseCost(db) {
    const instanceRates = {
      'db.t3.micro': 0.017,
      'db.t3.small': 0.034,
      'db.t3.medium': 0.068
    };
    
    const rate = instanceRates[db.instanceClass] || 0.1;
    return rate * 24 * 30 + (db.storage * 0.115); // Instance + storage
  }

  getSmallerInstanceType(currentType) {
    const downsizeMap = {
      't3.xlarge': 't3.large',
      't3.large': 't3.medium',
      't3.medium': 't3.small',
      't3.small': 't3.micro'
    };
    
    return downsizeMap[currentType] || currentType;
  }

  getBetterInstanceFamily(instance) {
    // Recommend newer generation instances
    if (instance.type.startsWith('t2')) {
      return instance.type.replace('t2', 't3');
    }
    if (instance.type.startsWith('m4')) {
      return instance.type.replace('m4', 'm5');
    }
    return null;
  }

  calculateRISavings(instanceType, count) {
    const onDemandCost = this.calculateInstanceCost({ type: instanceType }) * count * 12;
    const reservedCost = onDemandCost * 0.6; // Approximately 40% savings
    return onDemandCost - reservedCost;
  }

  getCurrentMonthlyCost() {
    // Simplified calculation
    return 5000;
  }

  getPreviousMonthlyCost() {
    return 4500;
  }

  getOptimizedMonthlyCost() {
    return 3500;
  }

  findUnusedResources() {
    return Promise.resolve([]);
  }

  calculateWastage(resources) {
    return resources.reduce((sum, r) => sum + (r.cost || 0), 0);
  }

  getImplementedOptimizations() {
    return [
      'Auto-scaling enabled',
      'Spot instances configured',
      'CDN caching implemented',
      'Resource tagging applied'
    ];
  }

  getNextSteps() {
    return [
      'Review and approve reserved instance purchases',
      'Implement recommended rightsizing changes',
      'Set up automated cost anomaly detection',
      'Schedule regular cost optimization reviews'
    ];
  }

  generateRecommendations(analysis) {
    const allRecommendations = [];
    
    // Collect all recommendations
    Object.values(analysis.breakdown).forEach(category => {
      if (category.recommendations) {
        allRecommendations.push(...category.recommendations);
      }
    });
    
    // Sort by potential savings
    allRecommendations.sort((a, b) => 
      (b.potentialSavings || 0) - (a.potentialSavings || 0)
    );
    
    return allRecommendations;
  }
}

module.exports = CostOptimizer;