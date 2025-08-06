/**
 * User data model and validation
 */
export class User {
  constructor(userData) {
    this.id = userData.id || userData._id?.toString();
    this.email = userData.email;
    this.password = userData.password;
    this.firstName = userData.firstName;
    this.lastName = userData.lastName;
    this.displayName = userData.displayName || `${userData.firstName} ${userData.lastName}`;
    this.workspaceId = userData.workspaceId;
    this.role = userData.role || 'user';
    this.permissions = userData.permissions || [];
    this.emailVerified = userData.emailVerified || false;
    this.emailVerifiedAt = userData.emailVerifiedAt;
    this.status = userData.status || 'active';
    this.preferences = userData.preferences || {};
    this.bio = userData.bio;
    this.avatar = userData.avatar;
    this.loginAttempts = userData.loginAttempts || 0;
    this.lockedUntil = userData.lockedUntil;
    this.createdAt = userData.createdAt || new Date();
    this.updatedAt = userData.updatedAt || new Date();
    this.lastLoginAt = userData.lastLoginAt;
    this.deletedAt = userData.deletedAt;
    this.deletedReason = userData.deletedReason;
  }

  /**
   * Get public user data (safe for API responses)
   */
  toPublic() {
    return {
      id: this.id,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      displayName: this.displayName,
      workspaceId: this.workspaceId,
      role: this.role,
      permissions: this.permissions,
      emailVerified: this.emailVerified,
      status: this.status,
      createdAt: this.createdAt,
      lastLoginAt: this.lastLoginAt,
      preferences: this.preferences,
    };
  }

  /**
   * Get admin user data (includes sensitive fields for admins)
   */
  toAdmin() {
    return {
      ...this.toPublic(),
      loginAttempts: this.loginAttempts,
      lockedUntil: this.lockedUntil,
      updatedAt: this.updatedAt,
      emailVerifiedAt: this.emailVerifiedAt,
      deletedAt: this.deletedAt,
      deletedReason: this.deletedReason,
    };
  }

  /**
   * Check if user has permission
   */
  hasPermission(permission) {
    return this.permissions.includes(permission) || this.role === 'super_admin';
  }

  /**
   * Check if user has role
   */
  hasRole(role) {
    const roleHierarchy = {
      'user': 1,
      'admin': 2,
      'super_admin': 3,
    };

    const userLevel = roleHierarchy[this.role] || 0;
    const requiredLevel = roleHierarchy[role] || 0;

    return userLevel >= requiredLevel;
  }

  /**
   * Check if user account is locked
   */
  isLocked() {
    return this.lockedUntil && this.lockedUntil > new Date();
  }

  /**
   * Check if user is active
   */
  isActive() {
    return this.status === 'active' && !this.isLocked();
  }

  /**
   * Get user's full name
   */
  getFullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  /**
   * Validate user data
   */
  validate() {
    const errors = [];

    if (!this.email || !ValidationUtils.isValidEmail(this.email)) {
      errors.push('Valid email is required');
    }

    if (!this.firstName || this.firstName.trim().length === 0) {
      errors.push('First name is required');
    }

    if (!this.lastName || this.lastName.trim().length === 0) {
      errors.push('Last name is required');
    }

    const validRoles = ['user', 'admin', 'super_admin'];
    if (!validRoles.includes(this.role)) {
      errors.push('Invalid user role');
    }

    const validStatuses = ['active', 'suspended', 'inactive', 'deleted'];
    if (!validStatuses.includes(this.status)) {
      errors.push('Invalid user status');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}