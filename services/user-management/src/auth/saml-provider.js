// ==========================================
// USER MANAGEMENT - SAML SSO Provider
// Enterprise SAML 2.0 integration with JIT provisioning
// ==========================================

import saml2 from 'saml2-js';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';

export class SAMLProvider {
  constructor(logger, mongoClient, redisClient, userManager) {
    this.logger = logger;
    this.mongoClient = mongoClient;
    this.redisClient = redisClient;
    this.userManager = userManager;
    
    // SAML configuration cache
    this.configCache = new Map();
    
    // Supported SAML providers
    this.supportedProviders = {
      okta: {
        name: 'Okta',
        metadataFormat: 'okta',
        attributeMapping: {
          email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
          firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
          lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
          displayName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
          groups: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups'
        }
      },
      azure: {
        name: 'Azure Active Directory',
        metadataFormat: 'azure',
        attributeMapping: {
          email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
          firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
          lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
          displayName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
          upn: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn',
          objectId: 'http://schemas.microsoft.com/identity/claims/objectidentifier'
        }
      },
      generic: {
        name: 'Generic SAML Provider',
        metadataFormat: 'generic',
        attributeMapping: {
          email: ['mail', 'email', 'emailAddress'],
          firstName: ['givenName', 'firstName', 'fname'],
          lastName: ['sn', 'surname', 'lastName', 'lname'],
          displayName: ['displayName', 'cn', 'name']
        }
      }
    };
    
    // XML parser configuration
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      parseAttributeValue: true,
      attributeNamePrefix: '@_'
    });
    
    this.initialize();
  }

  /**
   * Initialize SAML provider
   */
  async initialize() {
    try {
      // Create database indexes
      await this.createDatabaseIndexes();
      
      // Load cached SAML configurations
      await this.loadSAMLConfigurations();
      
      this.logger.info('SAML Provider initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize SAML Provider', error);
    }
  }

  /**
   * Create database indexes for SAML collections
   */
  async createDatabaseIndexes() {
    const db = this.mongoClient.getDb();
    
    // SAML configurations collection
    await db.collection('saml_configurations').createIndexes([
      { key: { workspaceId: 1 }, unique: true },
      { key: { entityId: 1 } },
      { key: { enabled: 1 } },
      { key: { createdAt: 1 } }
    ]);
    
    // SAML sessions collection
    await db.collection('saml_sessions').createIndexes([
      { key: { sessionIndex: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { workspaceId: 1 } },
      { key: { createdAt: 1 }, expireAfterSeconds: 8 * 60 * 60 } // 8 hours
    ]);
    
    // SAML audit logs collection
    await db.collection('saml_audit_logs').createIndexes([
      { key: { workspaceId: 1, timestamp: -1 } },
      { key: { userId: 1, timestamp: -1 } },
      { key: { event: 1, timestamp: -1 } },
      { key: { timestamp: 1 }, expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days
    ]);
  }

  /**
   * Configure SAML for workspace
   */
  async configureSAML(workspaceId, configuration) {
    const {
      provider,
      metadataXML,
      metadataURL,
      entityId,
      ssoURL,
      sloURL,
      certificate,
      attributeMapping = {},
      jitProvisioning = true,
      defaultRole = 'member',
      nameIdFormat = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      digestAlgorithm = 'http://www.w3.org/2001/04/xmlenc#sha256'
    } = configuration;

    try {
      // Validate configuration
      await this.validateSAMLConfiguration(configuration);
      
      // Parse metadata if provided
      let parsedMetadata = {};
      if (metadataXML) {
        parsedMetadata = await this.parseMetadata(metadataXML);
      } else if (metadataURL) {
        const metadataXML = await this.fetchMetadata(metadataURL);
        parsedMetadata = await this.parseMetadata(metadataXML);
      }
      
      // Create SAML configuration
      const config = {
        workspaceId,
        provider,
        entityId: entityId || parsedMetadata.entityId,
        ssoURL: ssoURL || parsedMetadata.ssoURL,
        sloURL: sloURL || parsedMetadata.sloURL,
        certificate: certificate || parsedMetadata.certificate,
        attributeMapping: {
          ...this.supportedProviders[provider]?.attributeMapping,
          ...attributeMapping
        },
        jitProvisioning,
        defaultRole,
        nameIdFormat,
        signatureAlgorithm,
        digestAlgorithm,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Generate service provider metadata
      config.spMetadata = await this.generateSPMetadata(workspaceId, config);
      
      // Store configuration
      const db = this.mongoClient.getDb();
      await db.collection('saml_configurations').replaceOne(
        { workspaceId },
        config,
        { upsert: true }
      );
      
      // Update cache
      this.configCache.set(workspaceId, config);
      
      // Log configuration change
      await this.logSAMLEvent(workspaceId, null, 'SAML_CONFIGURED', {
        provider,
        entityId: config.entityId
      });
      
      this.logger.info('SAML configured for workspace', {
        workspaceId,
        provider,
        entityId: config.entityId
      });
      
      return {
        success: true,
        configuration: {
          entityId: config.entityId,
          spMetadata: config.spMetadata,
          acsURL: `${process.env.BASE_URL}/auth/saml/${workspaceId}/acs`,
          sloURL: `${process.env.BASE_URL}/auth/saml/${workspaceId}/slo`
        }
      };
      
    } catch (error) {
      this.logger.error('Failed to configure SAML', error);
      throw error;
    }
  }

  /**
   * Initiate SAML SSO login
   */
  async initiateSSOLogin(workspaceId, options = {}) {
    const { relayState, forceAuthn = false } = options;
    
    try {
      // Get SAML configuration
      const config = await this.getSAMLConfiguration(workspaceId);
      if (!config || !config.enabled) {
        throw new Error('SAML not configured for this workspace');
      }
      
      // Create SAML service provider
      const sp = await this.createServiceProvider(workspaceId, config);
      
      // Generate SAML request ID
      const requestId = this.generateSAMLId();
      
      // Create SAML AuthnRequest
      const authnRequest = sp.create_login_request_url(
        config.entityId, // Identity Provider
        {
          request_id: requestId,
          force_authn: forceAuthn,
          nameid_format: config.nameIdFormat,
          relay_state: relayState
        }
      );
      
      // Cache request for validation
      await this.cacheAuthnRequest(requestId, workspaceId, {
        timestamp: Date.now(),
        relayState,
        forceAuthn
      });
      
      // Log SSO initiation
      await this.logSAMLEvent(workspaceId, null, 'SSO_INITIATED', {
        requestId,
        relayState
      });
      
      return {
        redirectURL: authnRequest,
        requestId
      };
      
    } catch (error) {
      this.logger.error('Failed to initiate SSO login', error);
      throw error;
    }
  }

  /**
   * Handle SAML response (ACS endpoint)
   */
  async handleSAMLResponse(workspaceId, samlResponse, relayState) {
    try {
      // Get SAML configuration
      const config = await this.getSAMLConfiguration(workspaceId);
      if (!config || !config.enabled) {
        throw new Error('SAML not configured for this workspace');
      }
      
      // Create SAML service provider
      const sp = await this.createServiceProvider(workspaceId, config);
      
      // Create identity provider
      const idp = await this.createIdentityProvider(config);
      
      // Parse and validate SAML response
      const response = await new Promise((resolve, reject) => {
        sp.post_assert(idp, { SAMLResponse: samlResponse }, (error, samlResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(samlResponse);
          }
        });
      });
      
      // Extract user attributes
      const userAttributes = await this.extractUserAttributes(response, config);
      
      // Find or create user (JIT provisioning)
      const user = await this.findOrCreateUser(workspaceId, userAttributes, config);
      
      // Create SAML session
      const session = await this.createSAMLSession(workspaceId, user.id, response, {
        sessionIndex: response.session_index,
        nameId: response.name_id,
        attributes: userAttributes
      });
      
      // Generate JWT tokens
      const tokens = await this.userManager.generateTokens(user, {
        samlSession: session.id,
        workspaceId
      });
      
      // Log successful authentication
      await this.logSAMLEvent(workspaceId, user.id, 'SSO_SUCCESS', {
        sessionIndex: response.session_index,
        nameId: response.name_id
      });
      
      return {
        success: true,
        user,
        tokens,
        session,
        relayState
      };
      
    } catch (error) {
      this.logger.error('Failed to handle SAML response', error);
      
      // Log failed authentication
      await this.logSAMLEvent(workspaceId, null, 'SSO_FAILED', {
        error: error.message,
        relayState
      });
      
      throw error;
    }
  }

  /**
   * Handle SAML logout (SLO endpoint)
   */
  async handleSAMLLogout(workspaceId, logoutRequest) {
    try {
      // Get SAML configuration
      const config = await this.getSAMLConfiguration(workspaceId);
      if (!config || !config.enabled) {
        throw new Error('SAML not configured for this workspace');
      }
      
      // Parse logout request
      const parsedRequest = await this.parseLogoutRequest(logoutRequest);
      
      // Find and invalidate SAML session
      const db = this.mongoClient.getDb();
      const session = await db.collection('saml_sessions').findOne({
        workspaceId,
        sessionIndex: parsedRequest.sessionIndex,
        nameId: parsedRequest.nameId
      });
      
      if (session) {
        // Invalidate session
        await db.collection('saml_sessions').updateOne(
          { _id: session._id },
          { $set: { status: 'logged_out', loggedOutAt: new Date() } }
        );
        
        // Invalidate user tokens
        await this.userManager.invalidateAllTokens(session.userId);
        
        // Log logout
        await this.logSAMLEvent(workspaceId, session.userId, 'SSO_LOGOUT', {
          sessionIndex: parsedRequest.sessionIndex,
          nameId: parsedRequest.nameId
        });
      }
      
      // Generate logout response
      const logoutResponse = await this.generateLogoutResponse(
        config,
        parsedRequest.requestId
      );
      
      return {
        success: true,
        logoutResponse
      };
      
    } catch (error) {
      this.logger.error('Failed to handle SAML logout', error);
      throw error;
    }
  }

  /**
   * Get Service Provider metadata
   */
  async getSPMetadata(workspaceId) {
    try {
      const config = await this.getSAMLConfiguration(workspaceId);
      if (!config) {
        throw new Error('SAML not configured for this workspace');
      }
      
      return config.spMetadata;
      
    } catch (error) {
      this.logger.error('Failed to get SP metadata', error);
      throw error;
    }
  }

  /**
   * Extract user attributes from SAML response
   */
  async extractUserAttributes(samlResponse, config) {
    const attributes = {};
    const attributeMapping = config.attributeMapping;
    
    // Extract attributes from SAML assertion
    const assertions = samlResponse.user || {};
    
    // Map standard attributes
    for (const [localAttr, samlAttr] of Object.entries(attributeMapping)) {
      if (Array.isArray(samlAttr)) {
        // Try multiple possible attribute names
        for (const attr of samlAttr) {
          if (assertions[attr]) {
            attributes[localAttr] = Array.isArray(assertions[attr]) 
              ? assertions[attr][0] 
              : assertions[attr];
            break;
          }
        }
      } else {
        if (assertions[samlAttr]) {
          attributes[localAttr] = Array.isArray(assertions[samlAttr]) 
            ? assertions[samlAttr][0] 
            : assertions[samlAttr];
        }
      }
    }
    
    // Ensure required attributes
    if (!attributes.email) {
      throw new Error('Email attribute not found in SAML response');
    }
    
    // Extract additional attributes
    attributes.groups = this.extractGroups(assertions, config);
    attributes.roles = this.mapGroupsToRoles(attributes.groups, config);
    
    return attributes;
  }

  /**
   * Find or create user with JIT provisioning
   */
  async findOrCreateUser(workspaceId, attributes, config) {
    try {
      // Try to find existing user by email
      let user = await this.userManager.findUserByEmail(attributes.email);
      
      if (user) {
        // Update user attributes if JIT provisioning is enabled
        if (config.jitProvisioning) {
          const updates = {};
          
          if (attributes.firstName && attributes.firstName !== user.firstName) {
            updates.firstName = attributes.firstName;
          }
          
          if (attributes.lastName && attributes.lastName !== user.lastName) {
            updates.lastName = attributes.lastName;
          }
          
          if (attributes.displayName && attributes.displayName !== user.displayName) {
            updates.displayName = attributes.displayName;
          }
          
          if (Object.keys(updates).length > 0) {
            user = await this.userManager.updateUser(user.id, updates);
          }
        }
        
        // Ensure user is member of workspace
        await this.ensureWorkspaceMembership(user, workspaceId, attributes, config);
        
      } else if (config.jitProvisioning) {
        // Create new user
        user = await this.userManager.createUser({
          email: attributes.email,
          firstName: attributes.firstName || '',
          lastName: attributes.lastName || '',
          displayName: attributes.displayName || attributes.email,
          emailVerified: true, // SAML users are pre-verified
          authProvider: 'saml',
          samlNameId: attributes.nameId
        });
        
        // Add user to workspace
        await this.ensureWorkspaceMembership(user, workspaceId, attributes, config);
        
      } else {
        throw new Error('User not found and JIT provisioning is disabled');
      }
      
      return user;
      
    } catch (error) {
      this.logger.error('Failed to find or create user', error);
      throw error;
    }
  }

  /**
   * Ensure user has workspace membership
   */
  async ensureWorkspaceMembership(user, workspaceId, attributes, config) {
    try {
      // Check if user is already a member
      const membership = await this.userManager.getWorkspaceMembership(user.id, workspaceId);
      
      if (!membership) {
        // Determine role from SAML attributes
        const role = this.determineUserRole(attributes, config);
        
        // Add user to workspace
        await this.userManager.addUserToWorkspace(user.id, workspaceId, role);
        
        this.logger.info('User added to workspace via SAML JIT', {
          userId: user.id,
          workspaceId,
          role
        });
      } else if (config.jitProvisioning) {
        // Update role if needed
        const newRole = this.determineUserRole(attributes, config);
        
        if (newRole !== membership.role && this.shouldUpdateRole(newRole, membership.role)) {
          await this.userManager.updateWorkspaceMembership(user.id, workspaceId, {
            role: newRole
          });
          
          this.logger.info('User role updated via SAML JIT', {
            userId: user.id,
            workspaceId,
            oldRole: membership.role,
            newRole
          });
        }
      }
      
    } catch (error) {
      this.logger.error('Failed to ensure workspace membership', error);
      throw error;
    }
  }

  /**
   * Determine user role from SAML attributes
   */
  determineUserRole(attributes, config) {
    // Check for admin groups
    if (attributes.groups && attributes.groups.some(group => 
      group.toLowerCase().includes('admin') || 
      group.toLowerCase().includes('administrator')
    )) {
      return 'admin';
    }
    
    // Check for custom role mapping
    if (config.roleMapping && attributes.roles) {
      for (const role of attributes.roles) {
        if (config.roleMapping[role]) {
          return config.roleMapping[role];
        }
      }
    }
    
    // Default role
    return config.defaultRole || 'member';
  }

  /**
   * Check if role should be updated
   */
  shouldUpdateRole(newRole, currentRole) {
    const roleHierarchy = ['viewer', 'member', 'admin', 'owner'];
    const newIndex = roleHierarchy.indexOf(newRole);
    const currentIndex = roleHierarchy.indexOf(currentRole);
    
    // Only update if new role is higher or same level
    // Don't downgrade owners automatically
    return newIndex >= currentIndex && currentRole !== 'owner';
  }

  /**
   * Extract groups from SAML assertions
   */
  extractGroups(assertions, config) {
    const groupsAttr = config.attributeMapping.groups;
    if (!groupsAttr || !assertions[groupsAttr]) {
      return [];
    }
    
    const groups = assertions[groupsAttr];
    return Array.isArray(groups) ? groups : [groups];
  }

  /**
   * Map groups to roles
   */
  mapGroupsToRoles(groups, config) {
    if (!config.groupRoleMapping || !groups) {
      return [];
    }
    
    const roles = [];
    for (const group of groups) {
      if (config.groupRoleMapping[group]) {
        roles.push(config.groupRoleMapping[group]);
      }
    }
    
    return roles;
  }

  /**
   * Create SAML session
   */
  async createSAMLSession(workspaceId, userId, samlResponse, sessionData) {
    try {
      const db = this.mongoClient.getDb();
      
      const session = {
        workspaceId,
        userId,
        sessionIndex: sessionData.sessionIndex,
        nameId: sessionData.nameId,
        attributes: sessionData.attributes,
        status: 'active',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
      };
      
      const result = await db.collection('saml_sessions').insertOne(session);
      session.id = result.insertedId;
      
      return session;
      
    } catch (error) {
      this.logger.error('Failed to create SAML session', error);
      throw error;
    }
  }

  /**
   * Get SAML configuration for workspace
   */
  async getSAMLConfiguration(workspaceId) {
    // Check cache first
    if (this.configCache.has(workspaceId)) {
      return this.configCache.get(workspaceId);
    }
    
    try {
      const db = this.mongoClient.getDb();
      const config = await db.collection('saml_configurations')
        .findOne({ workspaceId, enabled: true });
      
      if (config) {
        this.configCache.set(workspaceId, config);
      }
      
      return config;
      
    } catch (error) {
      this.logger.error('Failed to get SAML configuration', error);
      return null;
    }
  }

  /**
   * Create SAML service provider
   */
  async createServiceProvider(workspaceId, config) {
    const spOptions = {
      entity_id: `${process.env.BASE_URL}/auth/saml/${workspaceId}/metadata`,
      private_key: process.env.SAML_PRIVATE_KEY || this.generatePrivateKey(),
      certificate: process.env.SAML_CERTIFICATE || this.generateCertificate(),
      assert_endpoint: `${process.env.BASE_URL}/auth/saml/${workspaceId}/acs`,
      force_authn: false,
      auth_context: {
        comparison: 'exact',
        class_refs: ['urn:oasis:names:tc:SAML:1.1:ac:classes:PasswordProtectedTransport']
      },
      nameid_format: config.nameIdFormat,
      sign_get_request: false,
      allow_unencrypted_assertion: true
    };
    
    return new saml2.ServiceProvider(spOptions);
  }

  /**
   * Create SAML identity provider
   */
  async createIdentityProvider(config) {
    const idpOptions = {
      sso_login_url: config.ssoURL,
      sso_logout_url: config.sloURL,
      certificates: [config.certificate],
      force_authn: false,
      sign_get_request: false,
      allow_unencrypted_assertion: true
    };
    
    return new saml2.IdentityProvider(idpOptions);
  }

  /**
   * Generate Service Provider metadata
   */
  async generateSPMetadata(workspaceId, config) {
    const sp = await this.createServiceProvider(workspaceId, config);
    return sp.create_metadata();
  }

  /**
   * Parse SAML metadata
   */
  async parseMetadata(metadataXML) {
    try {
      const parsed = this.xmlParser.parse(metadataXML);
      
      // Extract entity ID
      const entityId = parsed.EntityDescriptor?.['@_entityID'];
      
      // Extract SSO URL
      const idpDescriptor = parsed.EntityDescriptor?.IDPSSODescriptor;
      const ssoServices = idpDescriptor?.SingleSignOnService;
      let ssoURL = null;
      
      if (Array.isArray(ssoServices)) {
        const httpRedirectService = ssoServices.find(service => 
          service['@_Binding'] === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
        );
        ssoURL = httpRedirectService?.['@_Location'];
      } else if (ssoServices) {
        ssoURL = ssoServices['@_Location'];
      }
      
      // Extract SLO URL
      const sloServices = idpDescriptor?.SingleLogoutService;
      let sloURL = null;
      
      if (Array.isArray(sloServices)) {
        const httpRedirectService = sloServices.find(service => 
          service['@_Binding'] === 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
        );
        sloURL = httpRedirectService?.['@_Location'];
      } else if (sloServices) {
        sloURL = sloServices['@_Location'];
      }
      
      // Extract certificate
      const keyDescriptors = idpDescriptor?.KeyDescriptor;
      let certificate = null;
      
      if (Array.isArray(keyDescriptors)) {
        const signingKey = keyDescriptors.find(key => 
          key['@_use'] === 'signing' || !key['@_use']
        );
        certificate = signingKey?.KeyInfo?.X509Data?.X509Certificate;
      } else if (keyDescriptors) {
        certificate = keyDescriptors.KeyInfo?.X509Data?.X509Certificate;
      }
      
      return {
        entityId,
        ssoURL,
        sloURL,
        certificate
      };
      
    } catch (error) {
      this.logger.error('Failed to parse SAML metadata', error);
      throw error;
    }
  }

  /**
   * Fetch metadata from URL
   */
  async fetchMetadata(metadataURL) {
    try {
      const response = await fetch(metadataURL);
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }
      
      return await response.text();
      
    } catch (error) {
      this.logger.error('Failed to fetch SAML metadata', error);
      throw error;
    }
  }

  /**
   * Validate SAML configuration
   */
  async validateSAMLConfiguration(config) {
    const required = ['provider'];
    
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required SAML configuration field: ${field}`);
      }
    }
    
    if (!config.metadataXML && !config.metadataURL && !config.ssoURL) {
      throw new Error('Either metadata XML, metadata URL, or SSO URL must be provided');
    }
    
    if (!this.supportedProviders[config.provider]) {
      throw new Error(`Unsupported SAML provider: ${config.provider}`);
    }
  }

  /**
   * Load SAML configurations from database
   */
  async loadSAMLConfigurations() {
    try {
      const db = this.mongoClient.getDb();
      const configs = await db.collection('saml_configurations')
        .find({ enabled: true })
        .toArray();
      
      for (const config of configs) {
        this.configCache.set(config.workspaceId, config);
      }
      
      this.logger.info('SAML configurations loaded', { count: configs.length });
      
    } catch (error) {
      this.logger.error('Failed to load SAML configurations', error);
    }
  }

  /**
   * Generate SAML ID
   */
  generateSAMLId() {
    return '_' + crypto.randomBytes(16).toString('hex');
  }

  /**
   * Cache authentication request
   */
  async cacheAuthnRequest(requestId, workspaceId, data) {
    try {
      await this.redisClient.setex(
        `saml:request:${requestId}`,
        600, // 10 minutes
        JSON.stringify({ workspaceId, ...data })
      );
    } catch (error) {
      this.logger.error('Failed to cache AuthnRequest', error);
    }
  }

  /**
   * Log SAML event
   */
  async logSAMLEvent(workspaceId, userId, event, details = {}) {
    try {
      const db = this.mongoClient.getDb();
      
      await db.collection('saml_audit_logs').insertOne({
        workspaceId,
        userId,
        event,
        details,
        timestamp: new Date(),
        ip: details.ip,
        userAgent: details.userAgent
      });
      
    } catch (error) {
      this.logger.error('Failed to log SAML event', error);
    }
  }

  /**
   * Get SAML statistics for workspace
   */
  async getSAMLStats(workspaceId, timeframe = '7d') {
    try {
      const db = this.mongoClient.getDb();
      
      let startTime;
      switch (timeframe) {
        case '1h':
          startTime = new Date(Date.now() - 60 * 60 * 1000);
          break;
        case '24h':
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }
      
      const [eventStats, sessionStats] = await Promise.all([
        // Event statistics
        db.collection('saml_audit_logs').aggregate([
          {
            $match: {
              workspaceId,
              timestamp: { $gte: startTime }
            }
          },
          {
            $group: {
              _id: '$event',
              count: { $sum: 1 }
            }
          }
        ]).toArray(),
        
        // Session statistics
        db.collection('saml_sessions').aggregate([
          {
            $match: {
              workspaceId,
              createdAt: { $gte: startTime }
            }
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]).toArray()
      ]);
      
      return {
        timeframe,
        events: eventStats,
        sessions: sessionStats,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('Failed to get SAML stats', error);
      return null;
    }
  }

  /**
   * Generate private key (placeholder - use actual key generation in production)
   */
  generatePrivateKey() {
    // In production, generate proper RSA key pair
    return process.env.SAML_PRIVATE_KEY || 'placeholder-private-key';
  }

  /**
   * Generate certificate (placeholder - use actual certificate in production)
   */
  generateCertificate() {
    // In production, generate proper X.509 certificate
    return process.env.SAML_CERTIFICATE || 'placeholder-certificate';
  }

  /**
   * Parse logout request
   */
  async parseLogoutRequest(logoutRequest) {
    try {
      // Decode and parse logout request
      const decodedRequest = Buffer.from(logoutRequest, 'base64').toString();
      const parsed = this.xmlParser.parse(decodedRequest);
      
      const logoutReq = parsed.LogoutRequest;
      
      return {
        requestId: logoutReq['@_ID'],
        sessionIndex: logoutReq.SessionIndex,
        nameId: logoutReq.NameID?.['#text'] || logoutReq.NameID
      };
      
    } catch (error) {
      this.logger.error('Failed to parse logout request', error);
      throw error;
    }
  }

  /**
   * Generate logout response
   */
  async generateLogoutResponse(config, requestId) {
    const responseId = this.generateSAMLId();
    const issueInstant = new Date().toISOString();
    
    const logoutResponse = `
      <samlp:LogoutResponse xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                           xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                           ID="${responseId}"
                           Version="2.0"
                           IssueInstant="${issueInstant}"
                           Destination="${config.sloURL}"
                           InResponseTo="${requestId}">
        <saml:Issuer>${process.env.BASE_URL}/auth/saml/metadata</saml:Issuer>
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
      </samlp:LogoutResponse>
    `;
    
    return Buffer.from(logoutResponse).toString('base64');
  }
}

export default SAMLProvider;