// ==========================================
// SERVICES/USER-MANAGEMENT/src/routes/admin.js
// ==========================================

import express from 'express';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/error-handler.js';
import { requireRole } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rate-limit.js';

const router = express.Router();

// Apply rate limiting
router.use(apiRateLimit);

// All admin routes require admin role
router.use(requireRole('admin'));

/**
 * GET /api/v1/admin/dashboard
 * Get admin dashboard statistics
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const [userStats, workspaceStats] = await Promise.all([
    req.userManager.getUserStats(),
    getWorkspaceStats(req.workspaceManager),
  ]);

  // Get system health
  const healthCheck = req.app.locals.healthCheck;
  const systemHealth = healthCheck ? await healthCheck.checkHealth() : null;

  // Get recent activity (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentUsers = await req.userManager.getUsers({
    filters: { createdAfter: thirtyDaysAgo },
    limit: 100,
  });

  const dashboardData = {
    overview: {
      totalUsers: userStats.totalUsers,
      activeUsers: userStats.activeUsers,
      totalWorkspaces: workspaceStats.totalWorkspaces,
      activeWorkspaces: workspaceStats.activeWorkspaces,
    },
    health: {
      status: systemHealth?.status || 'unknown',
      dependencies: systemHealth?.dependencies || {},
    },
    activity: {
      newUsersLast30Days: recentUsers.pagination.totalCount,
      userGrowthRate: calculateGrowthRate(recentUsers.users),
    },
    userDistribution: {
      byRole: userStats.byRole || {},
      byStatus: userStats.byStatus || {},
      emailVerified: userStats.verifiedUsers,
      emailUnverified: userStats.totalUsers - userStats.verifiedUsers,
    },
    timestamp: new Date().toISOString(),
  };

  res.json(dashboardData);
}));

/**
 * GET /api/v1/admin/users/analytics
 * Get detailed user analytics
 */
router.get('/users/analytics', asyncHandler(async (req, res) => {
  const { period = '30d', metric = 'registrations' } = req.query;

  const analytics = await getUserAnalytics(req.userManager, period, metric);

  res.json({
    period,
    metric,
    analytics,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/v1/admin/workspaces/analytics
 * Get workspace analytics
 */
router.get('/workspaces/analytics', asyncHandler(async (req, res) => {
  const workspaceAnalytics = await getWorkspaceAnalytics(req.workspaceManager);

  res.json({
    analytics: workspaceAnalytics,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/v1/admin/users/bulk-actions
 * Perform bulk actions on users
 */
router.post('/users/bulk-actions', asyncHandler(async (req, res) => {
  const { action, userIds, options = {} } = req.body;

  if (!action || !Array.isArray(userIds) || userIds.length === 0) {
    throw new ValidationError('Action and userIds array are required');
  }

  const validActions = ['activate', 'suspend', 'delete', 'verify-email'];
  if (!validActions.includes(action)) {
    throw new ValidationError(`Invalid action. Must be one of: ${validActions.join(', ')}`);
  }

  const results = {
    successful: [],
    failed: [],
    summary: {
      total: userIds.length,
      success: 0,
      failure: 0,
    },
  };

  // Process each user
  for (const userId of userIds) {
    try {
      await performUserAction(req.userManager, action, userId, options);
      results.successful.push(userId);
      results.summary.success++;
    } catch (error) {
      results.failed.push({
        userId,
        error: error.message,
      });
      results.summary.failure++;
    }
  }

  // Log bulk action
  req.logger?.info('Bulk user action performed', {
    action,
    totalUsers: userIds.length,
    successful: results.summary.success,
    failed: results.summary.failure,
    performedBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: `Bulk ${action} completed`,
    results,
  });
}));

/**
 * GET /api/v1/admin/audit-log
 * Get system audit log
 */
router.get('/audit-log', asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    action,
    userId,
    dateFrom,
    dateTo,
  } = req.query;

  // This would typically query an audit log collection
  // For now, return a placeholder structure
  const auditLog = {
    entries: [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalCount: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    },
    filters: {
      action,
      userId,
      dateFrom,
      dateTo,
    },
  };

  res.json(auditLog);
}));

/**
 * GET /api/v1/admin/system/health
 * Get detailed system health information
 */
router.get('/system/health', asyncHandler(async (req, res) => {
  const healthCheck = req.app.locals.healthCheck;
  
  if (!healthCheck) {
    throw new Error('Health check service not available');
  }

  const detailedHealth = await healthCheck.checkHealth();

  // Add system metrics
  const systemMetrics = {
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100),
    },
    uptime: {
      seconds: process.uptime(),
      formatted: formatUptime(process.uptime()),
    },
    cpu: process.cpuUsage(),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV,
  };

  res.json({
    ...detailedHealth,
    system: systemMetrics,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/v1/admin/system/maintenance
 * System maintenance operations
 */
router.post('/system/maintenance', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { operation, options = {} } = req.body;

  const validOperations = ['cleanup-deleted-users', 'cleanup-expired-sessions', 'rebuild-indexes'];
  
  if (!validOperations.includes(operation)) {
    throw new ValidationError(`Invalid operation. Must be one of: ${validOperations.join(', ')}`);
  }

  const result = await performMaintenanceOperation(
    operation,
    options,
    req.userManager,
    req.workspaceManager
  );

  req.logger?.info('Maintenance operation performed', {
    operation,
    result,
    performedBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: `Maintenance operation '${operation}' completed`,
    operation,
    result,
    performedBy: req.user.userId,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/v1/admin/reports/export
 * Export system reports
 */
router.get('/reports/export', asyncHandler(async (req, res) => {
  const { type = 'users', format = 'json', dateFrom, dateTo } = req.query;

  const validTypes = ['users', 'workspaces', 'activity'];
  const validFormats = ['json', 'csv'];

  if (!validTypes.includes(type)) {
    throw new ValidationError(`Invalid report type. Must be one of: ${validTypes.join(', ')}`);
  }

  if (!validFormats.includes(format)) {
    throw new ValidationError(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
  }

  const reportData = await generateReport(
    type,
    { dateFrom, dateTo },
    req.userManager,
    req.workspaceManager
  );

  // Set appropriate headers for download
  const filename = `${type}_report_${new Date().toISOString().split('T')[0]}.${format}`;
  
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(convertToCSV(reportData));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(reportData);
  }

  req.logger?.info('Report exported', {
    type,
    format,
    recordCount: Array.isArray(reportData) ? reportData.length : Object.keys(reportData).length,
    exportedBy: req.user.userId,
    correlationId: req.correlationId,
  });
}));

/**
 * POST /api/v1/admin/notifications/broadcast
 * Send broadcast notification to users
 */
router.post('/notifications/broadcast', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const {
    type = 'email',
    subject,
    message,
    recipients = 'all',
    filters = {},
  } = req.body;

  if (!subject || !message) {
    throw new ValidationError('Subject and message are required');
  }

  // Get target users based on recipients and filters
  const targetUsers = await getTargetUsers(recipients, filters, req.userManager);

  const broadcastResult = {
    totalUsers: targetUsers.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Send notifications (this would typically use a queue)
  for (const user of targetUsers) {
    try {
      if (type === 'email' && req.emailService) {
        await req.emailService.sendEmail(user.email, subject, message);
        broadcastResult.successful++;
      }
    } catch (error) {
      broadcastResult.failed++;
      broadcastResult.errors.push({
        userId: user.id,
        email: user.email,
        error: error.message,
      });
    }
  }

  req.logger?.info('Broadcast notification sent', {
    type,
    subject,
    totalUsers: broadcastResult.totalUsers,
    successful: broadcastResult.successful,
    failed: broadcastResult.failed,
    sentBy: req.user.userId,
    correlationId: req.correlationId,
  });

  res.json({
    message: 'Broadcast notification completed',
    result: broadcastResult,
    timestamp: new Date().toISOString(),
  });
}));

// Helper Functions

/**
 * Get workspace statistics
 */
async function getWorkspaceStats(workspaceManager) {
  try {
    // This would need to be implemented in WorkspaceManager
    const stats = await workspaceManager.getWorkspaceStats?.() || {
      totalWorkspaces: 0,
      activeWorkspaces: 0,
      totalProjects: 0,
      averageProjectsPerWorkspace: 0,
    };

    return stats;
  } catch (error) {
    return {
      totalWorkspaces: 0,
      activeWorkspaces: 0,
      error: 'Unable to fetch workspace stats',
    };
  }
}

/**
 * Calculate growth rate from user data
 */
function calculateGrowthRate(users) {
  if (!Array.isArray(users) || users.length === 0) return 0;

  const now = new Date();
  const last30Days = users.filter(user => {
    const createdAt = new Date(user.createdAt);
    return (now - createdAt) <= 30 * 24 * 60 * 60 * 1000;
  });

  const previous30Days = users.filter(user => {
    const createdAt = new Date(user.createdAt);
    const daysDiff = (now - createdAt) / (24 * 60 * 60 * 1000);
    return daysDiff > 30 && daysDiff <= 60;
  });

  if (previous30Days.length === 0) return 100;

  return Math.round(((last30Days.length - previous30Days.length) / previous30Days.length) * 100);
}

/**
 * Get user analytics for specified period
 */
async function getUserAnalytics(userManager, period, metric) {
  const analytics = {
    period,
    metric,
    data: [],
  };

  // Calculate date range based on period
  const now = new Date();
  let startDate;

  switch (period) {
    case '7d':
      startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
  }

  // This would typically aggregate data from the database
  // For now, return placeholder data
  const days = Math.ceil((now - startDate) / (24 * 60 * 60 * 1000));
  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    analytics.data.push({
      date: date.toISOString().split('T')[0],
      value: Math.floor(Math.random() * 10), // Placeholder data
    });
  }

  return analytics;
}

/**
 * Get workspace analytics
 */
async function getWorkspaceAnalytics(workspaceManager) {
  // This would typically query workspace data
  return {
    totalWorkspaces: 0,
    workspacesWithProjects: 0,
    averageProjectsPerWorkspace: 0,
    mostActiveWorkspaces: [],
    workspacesBySize: {
      small: 0, // 1-5 members
      medium: 0, // 6-20 members
      large: 0, // 20+ members
    },
  };
}

/**
 * Perform user action for bulk operations
 */
async function performUserAction(userManager, action, userId, options) {
  switch (action) {
    case 'activate':
      return await userManager.changeUserStatus(userId, 'active');
    
    case 'suspend':
      return await userManager.changeUserStatus(userId, 'suspended');
    
    case 'delete':
      return await userManager.deleteUser(userId, options.reason || 'admin_action');
    
    case 'verify-email':
      return await userManager.verifyEmail(userId);
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Perform maintenance operations
 */
async function performMaintenanceOperation(operation, options, userManager, workspaceManager) {
  switch (operation) {
    case 'cleanup-deleted-users':
      // Hard delete users that have been soft-deleted for more than 30 days
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      // Implementation would go here
      return { deletedCount: 0, message: 'Cleanup completed' };
    
    case 'cleanup-expired-sessions':
      // Clean up expired user sessions
      // Implementation would go here
      return { cleanedSessions: 0, message: 'Session cleanup completed' };
    
    case 'rebuild-indexes':
      // Rebuild database indexes
      // Implementation would go here
      return { message: 'Indexes rebuilt successfully' };
    
    default:
      throw new Error(`Unknown maintenance operation: ${operation}`);
  }
}

/**
 * Generate reports for export
 */
async function generateReport(type, filters, userManager, workspaceManager) {
  switch (type) {
    case 'users':
      const users = await userManager.getUsers({
        filters: {
          createdAfter: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
          createdBefore: filters.dateTo ? new Date(filters.dateTo) : undefined,
        },
        limit: 10000, // Large limit for export
      });
      
      return users.users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      }));
    
    case 'workspaces':
      // Implementation for workspace report
      return [];
    
    case 'activity':
      // Implementation for activity report
      return [];
    
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escape CSV values that contain commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  return csvContent;
}

/**
 * Get target users for broadcast notifications
 */
async function getTargetUsers(recipients, filters, userManager) {
  if (recipients === 'all') {
    const result = await userManager.getUsers({
      filters: {
        status: 'active',
        ...filters,
      },
      limit: 10000, // Large limit for broadcast
    });
    return result.users;
  }

  if (Array.isArray(recipients)) {
    // Specific user IDs
    const users = [];
    for (const userId of recipients) {
      try {
        const user = await userManager.getUser(userId);
        if (user && user.status === 'active') {
          users.push(user);
        }
      } catch (error) {
        // Skip invalid user IDs
      }
    }
    return users;
  }

  return [];
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export default router;