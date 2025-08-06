// ==========================================
// services/user-management/tests/fixtures/users.js
// ==========================================

export const testUsers = {
  validUser: {
    email: 'test@example.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
  },
  
  adminUser: {
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
  },

  suspendedUser: {
    email: 'suspended@example.com',
    password: 'SuspendedPassword123!',
    firstName: 'Suspended',
    lastName: 'User',
    status: 'suspended',
  },

  unverifiedUser: {
    email: 'unverified@example.com',
    password: 'UnverifiedPassword123!',
    firstName: 'Unverified',
    lastName: 'User',
    emailVerified: false,
  },
};

export const testWorkspaces = {
  validWorkspace: {
    name: 'Test Workspace',
    description: 'A test workspace for unit tests',
    settings: {
      allowGuestAccess: false,
      maxProjects: 10,
      maxMembers: 5,
    },
  },

  largeWorkspace: {
    name: 'Large Workspace',
    description: 'A workspace with many members',
    settings: {
      allowGuestAccess: true,
      maxProjects: 100,
      maxMembers: 50,
    },
  },
};