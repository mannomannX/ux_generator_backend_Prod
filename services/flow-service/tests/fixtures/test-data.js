// ==========================================
// FLOW SERVICE - Test Fixtures
// ==========================================

export const testFlows = {
  simple: {
    name: 'Login Flow',
    description: 'User authentication flow',
    projectId: 'proj_test_123',
    type: 'user-flow',
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: 'login', type: 'screen', position: { x: 200, y: 0 }, data: { label: 'Login Screen' } },
      { id: 'dashboard', type: 'screen', position: { x: 400, y: 0 }, data: { label: 'Dashboard' } },
      { id: 'end', type: 'end', position: { x: 600, y: 0 }, data: { label: 'End' } }
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'login' },
      { id: 'e2', source: 'login', target: 'dashboard' },
      { id: 'e3', source: 'dashboard', target: 'end' }
    ]
  },
  complex: {
    name: 'E-commerce Checkout',
    description: 'Complete checkout process with multiple paths',
    projectId: 'proj_test_456',
    type: 'user-flow',
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 200 }, data: { label: 'Start' } },
      { id: 'cart', type: 'screen', position: { x: 200, y: 200 }, data: { label: 'Shopping Cart' } },
      { id: 'login', type: 'screen', position: { x: 400, y: 100 }, data: { label: 'Login' } },
      { id: 'guest', type: 'screen', position: { x: 400, y: 300 }, data: { label: 'Guest Checkout' } },
      { id: 'shipping', type: 'screen', position: { x: 600, y: 200 }, data: { label: 'Shipping' } },
      { id: 'payment', type: 'screen', position: { x: 800, y: 200 }, data: { label: 'Payment' } },
      { id: 'review', type: 'screen', position: { x: 1000, y: 200 }, data: { label: 'Review' } },
      { id: 'confirmation', type: 'screen', position: { x: 1200, y: 200 }, data: { label: 'Confirmation' } },
      { id: 'end', type: 'end', position: { x: 1400, y: 200 }, data: { label: 'End' } }
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'cart' },
      { id: 'e2', source: 'cart', target: 'login' },
      { id: 'e3', source: 'cart', target: 'guest' },
      { id: 'e4', source: 'login', target: 'shipping' },
      { id: 'e5', source: 'guest', target: 'shipping' },
      { id: 'e6', source: 'shipping', target: 'payment' },
      { id: 'e7', source: 'payment', target: 'review' },
      { id: 'e8', source: 'review', target: 'confirmation' },
      { id: 'e9', source: 'confirmation', target: 'end' }
    ]
  },
  invalid: {
    orphanedEdge: {
      name: 'Invalid Flow',
      projectId: 'proj_test_123',
      nodes: [
        { id: 'node1', type: 'screen', position: { x: 0, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'node1', target: 'nonexistent' }
      ]
    },
    cycle: {
      name: 'Cyclic Flow',
      projectId: 'proj_test_123',
      nodes: [
        { id: 'a', type: 'screen', position: { x: 0, y: 0 } },
        { id: 'b', type: 'screen', position: { x: 100, y: 0 } },
        { id: 'c', type: 'screen', position: { x: 200, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
        { id: 'e3', source: 'c', target: 'a' } // Creates cycle
      ]
    },
    duplicateIds: {
      name: 'Duplicate IDs',
      projectId: 'proj_test_123',
      nodes: [
        { id: 'node1', type: 'screen', position: { x: 0, y: 0 } },
        { id: 'node1', type: 'screen', position: { x: 100, y: 0 } } // Duplicate
      ],
      edges: []
    }
  }
};

export const testProjects = {
  active: {
    id: 'proj_test_123',
    name: 'Test Project',
    workspaceId: 'work_test_123',
    owner: 'user_test_123',
    status: 'active'
  },
  archived: {
    id: 'proj_archived_123',
    name: 'Archived Project',
    workspaceId: 'work_test_123',
    owner: 'user_test_123',
    status: 'archived'
  }
};

export const testUsers = {
  owner: {
    id: 'user_test_123',
    email: 'owner@example.com',
    workspaceId: 'work_test_123',
    role: 'admin'
  },
  collaborator: {
    id: 'user_collab_123',
    email: 'collab@example.com',
    workspaceId: 'work_test_123',
    role: 'user'
  },
  external: {
    id: 'user_external_123',
    email: 'external@example.com',
    workspaceId: 'work_different_123',
    role: 'user'
  }
};

export const testVersions = {
  v1: {
    version: 1,
    createdAt: new Date('2024-01-01'),
    createdBy: 'user_test_123',
    changes: {
      nodes: { added: 2, removed: 0, modified: 1 },
      edges: { added: 1, removed: 0, modified: 0 }
    },
    snapshot: testFlows.simple
  },
  v2: {
    version: 2,
    createdAt: new Date('2024-01-02'),
    createdBy: 'user_collab_123',
    changes: {
      nodes: { added: 1, removed: 1, modified: 2 },
      edges: { added: 2, removed: 1, modified: 0 }
    },
    snapshot: testFlows.complex
  }
};

export const testShares = {
  public: {
    shareId: 'share_public_123',
    flowId: 'flow_test_123',
    shareType: 'public',
    token: 'pub_token_123',
    permissions: ['view'],
    createdAt: new Date('2024-01-01')
  },
  password: {
    shareId: 'share_pwd_123',
    flowId: 'flow_test_456',
    shareType: 'password',
    token: 'pwd_token_123',
    passwordHash: '$2b$10$hashedpassword',
    permissions: ['view', 'comment'],
    expiresAt: new Date('2024-12-31')
  },
  expired: {
    shareId: 'share_expired_123',
    flowId: 'flow_test_789',
    shareType: 'public',
    token: 'exp_token_123',
    permissions: ['view'],
    expiresAt: new Date('2023-01-01')
  }
};

export const testExports = {
  json: {
    format: 'json',
    includeMetadata: true,
    expectedContent: {
      flow: testFlows.simple,
      metadata: {
        exported: expect.any(String),
        version: '1.0.0'
      }
    }
  },
  svg: {
    format: 'svg',
    scale: 1,
    expectedContent: '<svg',
    contentType: 'image/svg+xml'
  },
  png: {
    format: 'png',
    scale: 2,
    quality: 90,
    contentType: 'image/png'
  },
  pdf: {
    format: 'pdf',
    includeMetadata: true,
    contentType: 'application/pdf'
  }
};

export const testValidationRules = {
  noOrphans: {
    rule: 'no-orphans',
    validFlow: testFlows.simple,
    invalidFlow: {
      ...testFlows.simple,
      nodes: [
        ...testFlows.simple.nodes,
        { id: 'orphan', type: 'screen', position: { x: 300, y: 200 } } // No edges
      ]
    }
  },
  noCycles: {
    rule: 'no-cycles',
    validFlow: testFlows.simple,
    invalidFlow: testFlows.invalid.cycle
  },
  singleStart: {
    rule: 'single-start',
    validFlow: testFlows.simple,
    invalidFlow: {
      ...testFlows.simple,
      nodes: [
        ...testFlows.simple.nodes,
        { id: 'start2', type: 'start', position: { x: 0, y: 100 } }
      ]
    }
  },
  singleEnd: {
    rule: 'single-end',
    validFlow: testFlows.simple,
    invalidFlow: {
      ...testFlows.simple,
      nodes: [
        ...testFlows.simple.nodes,
        { id: 'end2', type: 'end', position: { x: 600, y: 100 } }
      ]
    }
  },
  connected: {
    rule: 'connected',
    validFlow: testFlows.simple,
    invalidFlow: {
      name: 'Disconnected Flow',
      projectId: 'proj_test_123',
      nodes: [
        { id: 'group1', type: 'screen', position: { x: 0, y: 0 } },
        { id: 'group2', type: 'screen', position: { x: 200, y: 0 } },
        { id: 'isolated', type: 'screen', position: { x: 0, y: 200 } }
      ],
      edges: [
        { id: 'e1', source: 'group1', target: 'group2' }
      ]
    }
  }
};

export const testCollaboration = {
  session: {
    sessionId: 'collab_session_123',
    flowId: 'flow_test_123',
    participants: [
      { userId: 'user_test_123', cursor: { x: 100, y: 100 }, color: '#FF0000' },
      { userId: 'user_collab_123', cursor: { x: 200, y: 200 }, color: '#00FF00' }
    ],
    activeEdits: []
  },
  edit: {
    editId: 'edit_123',
    userId: 'user_test_123',
    type: 'node_move',
    nodeId: 'login',
    oldPosition: { x: 200, y: 0 },
    newPosition: { x: 250, y: 50 },
    timestamp: new Date()
  },
  conflict: {
    user1Edit: {
      nodeId: 'login',
      position: { x: 250, y: 50 }
    },
    user2Edit: {
      nodeId: 'login',
      position: { x: 300, y: 0 }
    }
  }
};

export const mockServices = {
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  mongoClient: {
    getDb: jest.fn(() => ({
      collection: jest.fn(() => ({
        findOne: jest.fn(),
        insertOne: jest.fn(),
        updateOne: jest.fn(),
        deleteOne: jest.fn(),
        find: jest.fn(() => ({
          toArray: jest.fn(),
          sort: jest.fn(() => ({
            limit: jest.fn(() => ({
              toArray: jest.fn()
            }))
          }))
        }))
      }))
    }))
  },
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    expire: jest.fn()
  },
  eventEmitter: {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }
};

export default {
  testFlows,
  testProjects,
  testUsers,
  testVersions,
  testShares,
  testExports,
  testValidationRules,
  testCollaboration,
  mockServices
};