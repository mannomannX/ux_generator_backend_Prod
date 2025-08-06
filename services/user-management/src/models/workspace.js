/**
 * Workspace data model and validation
 */
export class Workspace {
  constructor(workspaceData) {
    this.id = workspaceData.id || workspaceData._id?.toString();
    this.name = workspaceData.name;
    this.description = workspaceData.description;
    this.ownerId = workspaceData.ownerId;
    this.members = workspaceData.members || [];
    this.projectCount = workspaceData.projectCount || 0;
    this.settings = workspaceData.settings || {};
    this.status = workspaceData.status || 'active';
    this.metadata = workspaceData.metadata || {};
    this.createdAt = workspaceData.createdAt || new Date();
    this.updatedAt = workspaceData.updatedAt || new Date();
    this.deletedAt = workspaceData.deletedAt;
    this.deletedReason = workspaceData.deletedReason;
  }

  /**
   * Get public workspace data
   */
  toPublic(userId = null) {
    const member = this.members.find(m => m.userId === userId);
    
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      ownerId: this.ownerId,
      projectCount: this.projectCount,
      memberCount: this.members.length,
      settings: this.settings,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      ...(userId && {
        userRole: member?.role,
        isOwner: this.ownerId === userId,
        joinedAt: member?.joinedAt,
      }),
    };
  }

  /**
   * Get detailed workspace data (for owners/admins)
   */
  toDetailed() {
    return {
      ...this.toPublic(),
      members: this.members,
      metadata: this.metadata,
    };
  }

  /**
   * Check if user is owner
   */
  isOwner(userId) {
    return this.ownerId === userId;
  }

  /**
   * Check if user is member
   */
  isMember(userId) {
    return this.members.some(m => m.userId === userId) || this.isOwner(userId);
  }

  /**
   * Get user's role in workspace
   */
  getUserRole(userId) {
    if (this.isOwner(userId)) return 'owner';
    
    const member = this.members.find(m => m.userId === userId);
    return member?.role || null;
  }

  /**
   * Check if user has admin privileges
   */
  hasAdminAccess(userId) {
    const role = this.getUserRole(userId);
    return ['owner', 'admin'].includes(role);
  }

  /**
   * Check if workspace is at capacity
   */
  isAtMemberCapacity() {
    return this.members.length >= (this.settings.maxMembers || 5);
  }

  /**
   * Check if workspace is at project capacity
   */
  isAtProjectCapacity() {
    return this.projectCount >= (this.settings.maxProjects || 10);
  }

  /**
   * Validate workspace data
   */
  validate() {
    const errors = [];

    if (!this.name || this.name.trim().length < 2) {
      errors.push('Workspace name must be at least 2 characters');
    }

    if (this.name && this.name.length > 50) {
      errors.push('Workspace name must be less than 50 characters');
    }

    if (this.description && this.description.length > 500) {
      errors.push('Workspace description must be less than 500 characters');
    }

    if (!this.ownerId) {
      errors.push('Workspace must have an owner');
    }

    const validStatuses = ['active', 'suspended', 'deleted'];
    if (!validStatuses.includes(this.status)) {
      errors.push('Invalid workspace status');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}