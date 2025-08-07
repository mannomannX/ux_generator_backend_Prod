/**
 * Prompt Suggestion Admin Interface
 * 
 * Secure admin-only interface for reviewing and managing prompt improvement suggestions.
 * Provides endpoints for the human oversight required in the self-optimizing prompt system.
 * 
 * SECURITY: This interface should ONLY be accessible to authorized admins/developers
 */

import express from 'express';
import crypto from 'crypto';

class PromptSuggestionAdmin {
  constructor(logger, problemDatabase, eventEmitter) {
    this.logger = logger;
    this.problemDatabase = problemDatabase;
    this.eventEmitter = eventEmitter;
    
    // Security configuration
    this.config = {
      enabled: process.env.ENABLE_PROMPT_ADMIN === 'true',
      secretKey: process.env.PROMPT_ADMIN_SECRET || crypto.randomBytes(32).toString('hex'),
      sessionTimeout: 3600000, // 1 hour
      maxConcurrentSessions: 5
    };
    
    // Admin session tracking
    this.activeSessions = new Map();
    this.adminUsers = new Set(this.loadAdminUsers());
    
    // Request tracking for security
    this.requestLog = new Map();
    
    // Initialize router
    this.router = express.Router();
    this.setupRoutes();
  }

  /**
   * Setup admin routes with security middleware
   */
  setupRoutes() {
    // Security middleware for all admin routes
    this.router.use(this.authenticationMiddleware.bind(this));
    this.router.use(this.rateLimitingMiddleware.bind(this));
    
    // Dashboard routes
    this.router.get('/dashboard', this.getDashboard.bind(this));
    this.router.get('/statistics', this.getStatistics.bind(this));
    
    // Suggestion management routes
    this.router.get('/suggestions/new', this.getNewSuggestions.bind(this));
    this.router.get('/suggestions/:id', this.getSuggestionDetails.bind(this));
    this.router.post('/suggestions/:id/approve', this.approveSuggestion.bind(this));
    this.router.post('/suggestions/:id/reject', this.rejectSuggestion.bind(this));
    
    // Implementation tracking routes
    this.router.get('/suggestions/ready-for-implementation', this.getSuggestionsForImplementation.bind(this));
    this.router.post('/suggestions/:id/mark-implemented', this.markAsImplemented.bind(this));
    
    // Search and filtering
    this.router.get('/suggestions/search', this.searchSuggestions.bind(this));
    this.router.get('/suggestions/by-agent/:agentName', this.getSuggestionsByAgent.bind(this));
    this.router.get('/suggestions/by-status/:status', this.getSuggestionsByStatus.bind(this));
    
    // Authentication routes
    this.router.post('/auth/login', this.adminLogin.bind(this));
    this.router.post('/auth/logout', this.adminLogout.bind(this));
    this.router.get('/auth/session', this.getSessionInfo.bind(this));
  }

  /**
   * Authentication middleware
   */
  async authenticationMiddleware(req, res, next) {
    if (!this.config.enabled) {
      return res.status(503).json({ error: 'Admin interface disabled' });
    }

    // Skip auth for login endpoint
    if (req.path === '/auth/login') {
      return next();
    }

    const sessionToken = req.headers['x-admin-session'] || req.query.sessionToken;
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'No session token provided' });
    }

    const session = this.activeSessions.get(sessionToken);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    if (Date.now() - session.lastActivity > this.config.sessionTimeout) {
      this.activeSessions.delete(sessionToken);
      return res.status(401).json({ error: 'Session expired' });
    }

    // Update session activity
    session.lastActivity = Date.now();
    
    // Add admin info to request
    req.admin = {
      id: session.adminId,
      sessionId: sessionToken,
      permissions: session.permissions
    };

    next();
  }

  /**
   * Rate limiting middleware
   */
  rateLimitingMiddleware(req, res, next) {
    const clientId = req.admin?.id || req.ip;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 100;

    if (!this.requestLog.has(clientId)) {
      this.requestLog.set(clientId, []);
    }

    const requests = this.requestLog.get(clientId);
    
    // Clean old requests
    const recentRequests = requests.filter(time => now - time < windowMs);
    this.requestLog.set(clientId, recentRequests);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    recentRequests.push(now);
    next();
  }

  /**
   * Admin login
   */
  async adminLogin(req, res) {
    try {
      const { adminId, password } = req.body;
      
      if (!adminId || !password) {
        return res.status(400).json({ error: 'Admin ID and password required' });
      }

      // Verify admin credentials
      const isValid = await this.verifyAdminCredentials(adminId, password);
      
      if (!isValid) {
        this.logger.warn('Invalid admin login attempt', { adminId, ip: req.ip });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check concurrent session limit
      if (this.getActiveSessionsForAdmin(adminId) >= this.config.maxConcurrentSessions) {
        return res.status(429).json({ error: 'Too many active sessions' });
      }

      // Create session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const session = {
        adminId,
        sessionToken,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        permissions: this.getAdminPermissions(adminId),
        ip: req.ip
      };

      this.activeSessions.set(sessionToken, session);

      this.logger.info('Admin logged in', { adminId, sessionToken: sessionToken.substring(0, 8) });

      res.json({
        success: true,
        sessionToken,
        permissions: session.permissions,
        expiresIn: this.config.sessionTimeout
      });
    } catch (error) {
      this.logger.error('Admin login error', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  /**
   * Admin logout
   */
  async adminLogout(req, res) {
    try {
      const sessionToken = req.headers['x-admin-session'];
      
      if (sessionToken && this.activeSessions.has(sessionToken)) {
        this.activeSessions.delete(sessionToken);
        this.logger.info('Admin logged out', { adminId: req.admin.id });
      }

      res.json({ success: true });
    } catch (error) {
      this.logger.error('Admin logout error', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }

  /**
   * Get dashboard overview
   */
  async getDashboard(req, res) {
    try {
      const stats = await this.problemDatabase.getStatistics();
      const recentSuggestions = await this.problemDatabase.getNewSuggestions(5);
      const readyForImplementation = await this.problemDatabase.getSuggestionsForImplementation(5);

      res.json({
        statistics: stats,
        recentSuggestions: recentSuggestions.map(this.sanitizeSuggestion.bind(this)),
        readyForImplementation: readyForImplementation.map(this.sanitizeSuggestion.bind(this)),
        systemInfo: {
          adminInterface: 'active',
          lastUpdated: new Date(),
          activeSessions: this.activeSessions.size
        }
      });
    } catch (error) {
      this.logger.error('Failed to get dashboard data', error);
      res.status(500).json({ error: 'Failed to load dashboard' });
    }
  }

  /**
   * Get system statistics
   */
  async getStatistics(req, res) {
    try {
      const stats = await this.problemDatabase.getStatistics();
      
      res.json({
        ...stats,
        systemHealth: {
          adminSessions: this.activeSessions.size,
          requestRate: this.getRequestRate(),
          lastActivity: Date.now()
        }
      });
    } catch (error) {
      this.logger.error('Failed to get statistics', error);
      res.status(500).json({ error: 'Failed to load statistics' });
    }
  }

  /**
   * Get new suggestions for review
   */
  async getNewSuggestions(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;

      const suggestions = await this.problemDatabase.getSuggestionsByStatus('new', limit, offset);

      res.json({
        suggestions: suggestions.map(this.sanitizeSuggestion.bind(this)),
        pagination: {
          limit,
          offset,
          total: await this.problemDatabase.getStatistics().then(s => s.newSuggestions)
        }
      });
    } catch (error) {
      this.logger.error('Failed to get new suggestions', error);
      res.status(500).json({ error: 'Failed to load suggestions' });
    }
  }

  /**
   * Get detailed suggestion information
   */
  async getSuggestionDetails(req, res) {
    try {
      const suggestionId = req.params.id;
      const suggestion = await this.problemDatabase.getSuggestion(suggestionId);

      if (!suggestion) {
        return res.status(404).json({ error: 'Suggestion not found' });
      }

      res.json({
        suggestion: this.sanitizeSuggestion(suggestion, false) // Include full details
      });
    } catch (error) {
      this.logger.error('Failed to get suggestion details', error);
      res.status(500).json({ error: 'Failed to load suggestion' });
    }
  }

  /**
   * Approve a suggestion
   */
  async approveSuggestion(req, res) {
    try {
      const suggestionId = req.params.id;
      const { reviewNotes } = req.body;

      const success = await this.problemDatabase.approveSuggestion(
        suggestionId, 
        req.admin.id, 
        reviewNotes
      );

      if (success) {
        // Emit event to trigger prompt optimization
        this.eventEmitter.emit('suggestion-approved', {
          suggestionId,
          approvedBy: req.admin.id,
          timestamp: new Date()
        });

        res.json({ success: true, message: 'Suggestion approved' });
      } else {
        res.status(400).json({ error: 'Failed to approve suggestion' });
      }
    } catch (error) {
      this.logger.error('Failed to approve suggestion', error);
      res.status(500).json({ error: 'Approval failed' });
    }
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(req, res) {
    try {
      const suggestionId = req.params.id;
      const { rejectionReason } = req.body;

      if (!rejectionReason) {
        return res.status(400).json({ error: 'Rejection reason required' });
      }

      const success = await this.problemDatabase.rejectSuggestion(
        suggestionId, 
        req.admin.id, 
        rejectionReason
      );

      if (success) {
        res.json({ success: true, message: 'Suggestion rejected' });
      } else {
        res.status(400).json({ error: 'Failed to reject suggestion' });
      }
    } catch (error) {
      this.logger.error('Failed to reject suggestion', error);
      res.status(500).json({ error: 'Rejection failed' });
    }
  }

  /**
   * Get suggestions ready for implementation
   */
  async getSuggestionsForImplementation(req, res) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);
      const suggestions = await this.problemDatabase.getSuggestionsForImplementation(limit);

      res.json({
        suggestions: suggestions.map(this.sanitizeSuggestion.bind(this))
      });
    } catch (error) {
      this.logger.error('Failed to get suggestions for implementation', error);
      res.status(500).json({ error: 'Failed to load suggestions' });
    }
  }

  /**
   * Mark suggestion as implemented
   */
  async markAsImplemented(req, res) {
    try {
      const suggestionId = req.params.id;
      const { notes, filePath, oldPromptHash, newPromptHash } = req.body;

      const success = await this.problemDatabase.markAsImplemented(suggestionId, req.admin.id, {
        notes,
        filePath,
        oldPromptHash,
        newPromptHash
      });

      if (success) {
        res.json({ success: true, message: 'Suggestion marked as implemented' });
      } else {
        res.status(400).json({ error: 'Failed to mark as implemented' });
      }
    } catch (error) {
      this.logger.error('Failed to mark as implemented', error);
      res.status(500).json({ error: 'Implementation marking failed' });
    }
  }

  /**
   * Search suggestions
   */
  async searchSuggestions(req, res) {
    try {
      const { q: searchTerm, limit = 20 } = req.query;

      if (!searchTerm) {
        return res.status(400).json({ error: 'Search term required' });
      }

      const suggestions = await this.problemDatabase.searchSuggestions(
        searchTerm, 
        Math.min(limit, 50)
      );

      res.json({
        suggestions: suggestions.map(this.sanitizeSuggestion.bind(this)),
        searchTerm
      });
    } catch (error) {
      this.logger.error('Failed to search suggestions', error);
      res.status(500).json({ error: 'Search failed' });
    }
  }

  /**
   * Get suggestions by agent
   */
  async getSuggestionsByAgent(req, res) {
    try {
      const agentName = req.params.agentName;
      const status = req.query.status;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);

      const suggestions = await this.problemDatabase.getSuggestionsByAgent(agentName, status, limit);

      res.json({
        suggestions: suggestions.map(this.sanitizeSuggestion.bind(this)),
        agentName,
        status
      });
    } catch (error) {
      this.logger.error('Failed to get suggestions by agent', error);
      res.status(500).json({ error: 'Failed to load suggestions' });
    }
  }

  /**
   * Get suggestions by status
   */
  async getSuggestionsByStatus(req, res) {
    try {
      const status = req.params.status;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;

      const suggestions = await this.problemDatabase.getSuggestionsByStatus(status, limit, offset);

      res.json({
        suggestions: suggestions.map(this.sanitizeSuggestion.bind(this)),
        status,
        pagination: { limit, offset }
      });
    } catch (error) {
      this.logger.error('Failed to get suggestions by status', error);
      res.status(500).json({ error: 'Failed to load suggestions' });
    }
  }

  /**
   * Get session information
   */
  async getSessionInfo(req, res) {
    try {
      const session = this.activeSessions.get(req.admin.sessionId);
      
      res.json({
        adminId: req.admin.id,
        permissions: req.admin.permissions,
        sessionCreated: new Date(session.createdAt),
        lastActivity: new Date(session.lastActivity),
        expiresAt: new Date(session.lastActivity + this.config.sessionTimeout)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get session info' });
    }
  }

  /**
   * Private helper methods
   */

  sanitizeSuggestion(suggestion, summary = true) {
    const sanitized = {
      id: suggestion._id,
      sourceAgent: suggestion.sourceAgent,
      detectedProblem: suggestion.detectedProblem,
      status: suggestion.status,
      priority: suggestion.priority,
      confidence: suggestion.confidence,
      createdAt: suggestion.createdAt,
      reviewedAt: suggestion.reviewedAt,
      implementedAt: suggestion.implementedAt
    };

    if (!summary) {
      // Include full details for detail view
      sanitized.evidence = suggestion.evidence;
      sanitized.suggestedPrompt = suggestion.suggestedPrompt;
      sanitized.reviewData = suggestion.reviewData;
      sanitized.implementationData = suggestion.implementationData;
      sanitized.analysisMetadata = suggestion.analysisMetadata;
    }

    return sanitized;
  }

  async verifyAdminCredentials(adminId, password) {
    // In production, integrate with your actual auth system
    const expectedPassword = process.env[`ADMIN_PASSWORD_${adminId.toUpperCase()}`];
    
    if (!expectedPassword || !this.adminUsers.has(adminId)) {
      return false;
    }

    // Simple password check (in production, use proper hashing)
    return password === expectedPassword;
  }

  getAdminPermissions(adminId) {
    // Define permissions based on admin user
    // In production, load from database or config
    return {
      canReview: true,
      canApprove: true,
      canReject: true,
      canImplement: true,
      canViewAll: true
    };
  }

  loadAdminUsers() {
    // Load admin users from environment or config
    const adminUsersStr = process.env.ADMIN_USERS || 'admin,dev';
    return adminUsersStr.split(',').map(u => u.trim());
  }

  getActiveSessionsForAdmin(adminId) {
    return Array.from(this.activeSessions.values())
      .filter(session => session.adminId === adminId).length;
  }

  getRequestRate() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let totalRequests = 0;
    for (const requests of this.requestLog.values()) {
      totalRequests += requests.filter(time => time > oneMinuteAgo).length;
    }
    
    return totalRequests;
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [token, session] of this.activeSessions) {
      if (now - session.lastActivity > this.config.sessionTimeout) {
        expiredSessions.push(token);
      }
    }

    for (const token of expiredSessions) {
      this.activeSessions.delete(token);
    }

    if (expiredSessions.length > 0) {
      this.logger.debug('Cleaned up expired admin sessions', {
        count: expiredSessions.length
      });
    }
  }

  /**
   * Get router for mounting in Express app
   */
  getRouter() {
    return this.router;
  }

  /**
   * Shutdown admin interface
   */
  shutdown() {
    this.logger.info('Prompt suggestion admin interface shutting down', {
      activeSessions: this.activeSessions.size
    });
    
    this.activeSessions.clear();
  }
}

export { PromptSuggestionAdmin };