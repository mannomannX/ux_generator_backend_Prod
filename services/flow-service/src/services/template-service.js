// ==========================================
// FLOW SERVICE - Template Management Service
// Based on OPEN_QUESTIONS_ANSWERS.md specifications
// ==========================================

import { ObjectId } from 'mongodb';
import { flowLimits } from '../config/flow-limits.js';

export class TemplateService {
  constructor(logger, mongoClient, cacheManager, validationService) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.cacheManager = cacheManager;
    this.validationService = validationService;
    
    // Industry templates as specified in answers
    this.industryTemplates = {
      ecommerce: this.getEcommerceTemplate(),
      saas: this.getSaasTemplate(),
      mobile: this.getMobileTemplate()
    };
  }

  /**
   * Get all available templates
   */
  async getTemplates(workspaceId, options = {}) {
    try {
      const { category, includeShared = true, includeIndustry = true } = options;
      const templates = [];

      // Add industry templates
      if (includeIndustry) {
        Object.entries(this.industryTemplates).forEach(([key, template]) => {
          if (!category || template.category === category) {
            templates.push({
              ...template,
              id: `industry_${key}`,
              type: 'industry',
              isEditable: false
            });
          }
        });
      }

      // Add workspace templates
      if (workspaceId) {
        const db = this.mongoClient.getDb();
        const workspaceTemplates = await db.collection('flow_templates')
          .find({
            workspaceId,
            ...(category && { category })
          })
          .toArray();
        
        templates.push(...workspaceTemplates.map(t => ({
          ...t,
          id: t._id.toString(),
          type: 'workspace',
          isEditable: true
        })));
      }

      // Add shared templates if enabled
      if (includeShared) {
        const db = this.mongoClient.getDb();
        const sharedTemplates = await db.collection('flow_templates')
          .find({
            isPublic: true,
            ...(category && { category })
          })
          .limit(50)
          .toArray();
        
        templates.push(...sharedTemplates.map(t => ({
          ...t,
          id: t._id.toString(),
          type: 'shared',
          isEditable: false
        })));
      }

      return templates;
    } catch (error) {
      this.logger.error('Failed to get templates', error);
      throw error;
    }
  }

  /**
   * Create template from existing flow
   */
  async createTemplate(flowId, userId, workspaceId, templateData) {
    try {
      const db = this.mongoClient.getDb();
      
      // Get the source flow
      const flow = await db.collection('flows').findOne({
        _id: new ObjectId(flowId)
      });

      if (!flow) {
        throw new Error('Source flow not found');
      }

      // Create template with versioning
      const template = {
        _id: new ObjectId(),
        name: templateData.name || `Template from ${flow.metadata?.flowName}`,
        description: templateData.description,
        category: templateData.category || 'custom',
        workspaceId,
        createdBy: userId,
        sourceFlowId: flowId,
        version: '1.0.0', // Templates have their own versioning
        versionHistory: [{
          version: '1.0.0',
          createdAt: new Date(),
          createdBy: userId,
          changelog: 'Initial template creation'
        }],
        // Flow structure
        nodes: flow.nodes,
        edges: flow.edges,
        metadata: {
          ...flow.metadata,
          isTemplate: true,
          templateId: null, // Remove reference to parent template
          originalFlowId: flowId
        },
        // Template-specific fields
        customData: templateData.customData || {},
        tags: templateData.tags || [],
        isPublic: templateData.isPublic || false,
        usage: {
          count: 0,
          lastUsed: null,
          users: []
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate template structure
      const validation = await this.validationService.validateFlow(template);
      if (!validation.isValid) {
        throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
      }

      await db.collection('flow_templates').insertOne(template);

      this.logger.info('Template created', {
        templateId: template._id,
        name: template.name,
        workspaceId
      });

      return template;
    } catch (error) {
      this.logger.error('Failed to create template', error);
      throw error;
    }
  }

  /**
   * Create flow from template
   */
  async createFlowFromTemplate(templateId, projectId, userId, workspaceId, options = {}) {
    try {
      const db = this.mongoClient.getDb();
      let template;

      // Check if it's an industry template
      if (templateId.startsWith('industry_')) {
        const key = templateId.replace('industry_', '');
        template = this.industryTemplates[key];
        if (!template) {
          throw new Error('Industry template not found');
        }
      } else {
        // Get custom template from database
        template = await db.collection('flow_templates').findOne({
          _id: new ObjectId(templateId)
        });
        
        if (!template) {
          throw new Error('Template not found');
        }

        // Update template usage statistics
        await db.collection('flow_templates').updateOne(
          { _id: new ObjectId(templateId) },
          {
            $inc: { 'usage.count': 1 },
            $set: { 'usage.lastUsed': new Date() },
            $addToSet: { 'usage.users': userId }
          }
        );
      }

      // Create new flow from template
      const flow = {
        _id: new ObjectId(),
        projectId,
        workspaceId,
        metadata: {
          ...template.metadata,
          flowName: options.flowName || template.name,
          templateId: templateId,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          isTemplate: false,
          customData: {
            ...template.customData,
            ...options.customData
          }
        },
        nodes: JSON.parse(JSON.stringify(template.nodes)), // Deep clone
        edges: JSON.parse(JSON.stringify(template.edges)), // Deep clone
        status: 'draft',
        isActive: true
      };

      // Insert the new flow
      await db.collection('flows').insertOne(flow);

      this.logger.info('Flow created from template', {
        flowId: flow._id,
        templateId,
        projectId,
        workspaceId
      });

      return flow;
    } catch (error) {
      this.logger.error('Failed to create flow from template', error);
      throw error;
    }
  }

  /**
   * Update template version
   */
  async updateTemplateVersion(templateId, updates, userId) {
    try {
      const db = this.mongoClient.getDb();
      
      const template = await db.collection('flow_templates').findOne({
        _id: new ObjectId(templateId)
      });

      if (!template) {
        throw new Error('Template not found');
      }

      // Calculate new version
      const currentVersion = template.version;
      const versionParts = currentVersion.split('.');
      versionParts[2] = (parseInt(versionParts[2]) + 1).toString(); // Increment patch version
      const newVersion = versionParts.join('.');

      // Add to version history
      const versionEntry = {
        version: newVersion,
        createdAt: new Date(),
        createdBy: userId,
        changelog: updates.changelog || 'Template updated'
      };

      // Update template
      await db.collection('flow_templates').updateOne(
        { _id: new ObjectId(templateId) },
        {
          $set: {
            ...updates,
            version: newVersion,
            updatedAt: new Date()
          },
          $push: {
            versionHistory: versionEntry
          }
        }
      );

      this.logger.info('Template version updated', {
        templateId,
        oldVersion: currentVersion,
        newVersion
      });

      return { version: newVersion };
    } catch (error) {
      this.logger.error('Failed to update template version', error);
      throw error;
    }
  }

  /**
   * E-commerce template as specified
   */
  getEcommerceTemplate() {
    return {
      name: 'E-Commerce Checkout Flow',
      category: 'ecommerce',
      description: 'Standard e-commerce checkout flow with cart, shipping, payment, and confirmation',
      metadata: {
        flowName: 'E-Commerce Checkout',
        description: 'Complete checkout flow for e-commerce applications',
        tags: ['ecommerce', 'checkout', 'payment'],
        industry: 'ecommerce'
      },
      nodes: [
        { id: 'start', type: 'Start', position: { x: 100, y: 200 }, data: { label: 'Start Shopping' } },
        { id: 'browse', type: 'Screen', position: { x: 250, y: 200 }, data: { label: 'Product Browse', screenType: 'catalog' } },
        { id: 'product', type: 'Screen', position: { x: 400, y: 200 }, data: { label: 'Product Details', screenType: 'detail' } },
        { id: 'cart', type: 'Screen', position: { x: 550, y: 200 }, data: { label: 'Shopping Cart', screenType: 'cart' } },
        { id: 'checkout', type: 'Screen', position: { x: 700, y: 200 }, data: { label: 'Checkout', screenType: 'form' } },
        { id: 'shipping', type: 'Screen', position: { x: 850, y: 200 }, data: { label: 'Shipping Info', screenType: 'form' } },
        { id: 'payment', type: 'Screen', position: { x: 1000, y: 200 }, data: { label: 'Payment', screenType: 'payment' } },
        { id: 'review', type: 'Screen', position: { x: 1150, y: 200 }, data: { label: 'Order Review', screenType: 'summary' } },
        { id: 'confirm', type: 'Screen', position: { x: 1300, y: 200 }, data: { label: 'Confirmation', screenType: 'success' } },
        { id: 'end', type: 'End', position: { x: 1450, y: 200 }, data: { label: 'Order Complete' } }
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'browse', data: { label: 'Begin' } },
        { id: 'e2', source: 'browse', target: 'product', data: { label: 'Select Product' } },
        { id: 'e3', source: 'product', target: 'cart', data: { label: 'Add to Cart' } },
        { id: 'e4', source: 'cart', target: 'checkout', data: { label: 'Proceed to Checkout' } },
        { id: 'e5', source: 'checkout', target: 'shipping', data: { label: 'Continue' } },
        { id: 'e6', source: 'shipping', target: 'payment', data: { label: 'Continue' } },
        { id: 'e7', source: 'payment', target: 'review', data: { label: 'Continue' } },
        { id: 'e8', source: 'review', target: 'confirm', data: { label: 'Place Order' } },
        { id: 'e9', source: 'confirm', target: 'end', data: { label: 'Complete' } }
      ]
    };
  }

  /**
   * SaaS onboarding template as specified
   */
  getSaasTemplate() {
    return {
      name: 'SaaS User Onboarding',
      category: 'saas',
      description: 'User registration and onboarding flow for SaaS applications',
      metadata: {
        flowName: 'SaaS Onboarding',
        description: 'Complete onboarding flow with registration, verification, and setup',
        tags: ['saas', 'onboarding', 'registration'],
        industry: 'saas'
      },
      nodes: [
        { id: 'start', type: 'Start', position: { x: 100, y: 200 }, data: { label: 'Landing Page' } },
        { id: 'signup', type: 'Screen', position: { x: 250, y: 200 }, data: { label: 'Sign Up', screenType: 'form' } },
        { id: 'verify', type: 'Screen', position: { x: 400, y: 200 }, data: { label: 'Email Verification', screenType: 'verification' } },
        { id: 'profile', type: 'Screen', position: { x: 550, y: 200 }, data: { label: 'Profile Setup', screenType: 'form' } },
        { id: 'workspace', type: 'Screen', position: { x: 700, y: 200 }, data: { label: 'Create Workspace', screenType: 'form' } },
        { id: 'invite', type: 'Screen', position: { x: 850, y: 200 }, data: { label: 'Invite Team', screenType: 'form', optional: true } },
        { id: 'tour', type: 'Screen', position: { x: 1000, y: 200 }, data: { label: 'Product Tour', screenType: 'tutorial' } },
        { id: 'dashboard', type: 'Screen', position: { x: 1150, y: 200 }, data: { label: 'Dashboard', screenType: 'dashboard' } },
        { id: 'end', type: 'End', position: { x: 1300, y: 200 }, data: { label: 'Onboarding Complete' } }
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'signup', data: { label: 'Get Started' } },
        { id: 'e2', source: 'signup', target: 'verify', data: { label: 'Submit' } },
        { id: 'e3', source: 'verify', target: 'profile', data: { label: 'Verified' } },
        { id: 'e4', source: 'profile', target: 'workspace', data: { label: 'Continue' } },
        { id: 'e5', source: 'workspace', target: 'invite', data: { label: 'Continue' } },
        { id: 'e6', source: 'invite', target: 'tour', data: { label: 'Continue' } },
        { id: 'e6b', source: 'workspace', target: 'tour', data: { label: 'Skip Invite' } },
        { id: 'e7', source: 'tour', target: 'dashboard', data: { label: 'Start Using' } },
        { id: 'e8', source: 'dashboard', target: 'end', data: { label: 'Complete' } }
      ]
    };
  }

  /**
   * Mobile social media template as specified
   */
  getMobileTemplate() {
    return {
      name: 'Mobile Social Media Flow',
      category: 'mobile',
      description: 'Social media app flow for mobile applications',
      metadata: {
        flowName: 'Social Media Mobile App',
        description: 'Mobile app flow for social media interactions',
        tags: ['mobile', 'social', 'app'],
        industry: 'mobile'
      },
      nodes: [
        { id: 'start', type: 'Start', position: { x: 100, y: 200 }, data: { label: 'App Launch' } },
        { id: 'splash', type: 'Screen', position: { x: 250, y: 200 }, data: { label: 'Splash Screen', screenType: 'splash' } },
        { id: 'auth_check', type: 'Decision', position: { x: 400, y: 200 }, data: { label: 'Authenticated?', condition: 'isAuthenticated' } },
        { id: 'login', type: 'Screen', position: { x: 550, y: 100 }, data: { label: 'Login', screenType: 'form' } },
        { id: 'feed', type: 'Screen', position: { x: 700, y: 200 }, data: { label: 'Feed', screenType: 'list' } },
        { id: 'post', type: 'Screen', position: { x: 850, y: 100 }, data: { label: 'Create Post', screenType: 'form' } },
        { id: 'profile', type: 'Screen', position: { x: 850, y: 300 }, data: { label: 'Profile', screenType: 'profile' } },
        { id: 'settings', type: 'Screen', position: { x: 1000, y: 300 }, data: { label: 'Settings', screenType: 'settings' } },
        { id: 'end', type: 'End', position: { x: 1150, y: 200 }, data: { label: 'App Exit' } }
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'splash', data: { label: 'Launch' } },
        { id: 'e2', source: 'splash', target: 'auth_check', data: { label: 'Load' } },
        { id: 'e3', source: 'auth_check', target: 'login', data: { label: 'Not Authenticated' } },
        { id: 'e4', source: 'auth_check', target: 'feed', data: { label: 'Authenticated' } },
        { id: 'e5', source: 'login', target: 'feed', data: { label: 'Success' } },
        { id: 'e6', source: 'feed', target: 'post', data: { label: 'Create' } },
        { id: 'e7', source: 'feed', target: 'profile', data: { label: 'View Profile' } },
        { id: 'e8', source: 'post', target: 'feed', data: { label: 'Post Created' } },
        { id: 'e9', source: 'profile', target: 'settings', data: { label: 'Settings' } },
        { id: 'e10', source: 'profile', target: 'feed', data: { label: 'Back' } },
        { id: 'e11', source: 'settings', target: 'profile', data: { label: 'Back' } },
        { id: 'e12', source: 'feed', target: 'end', data: { label: 'Exit' } }
      ]
    };
  }

  /**
   * Get template marketplace items (future feature)
   */
  async getMarketplaceTemplates(options = {}) {
    // Placeholder for future template marketplace
    // This will connect to a central repository of community templates
    this.logger.info('Template marketplace not yet implemented');
    return [];
  }
}

export default TemplateService;