/**
 * Root-level Jest Configuration for UX-Flow-Engine Monorepo
 * 
 * This configuration provides consistent testing across all services
 * while supporting ES6 modules and service-specific test requirements.
 */

export default {
  // Projects configuration for monorepo testing
  projects: [
    // API Gateway Service
    {
      displayName: 'api-gateway',
      testMatch: ['<rootDir>/services/api-gateway/tests/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/services/api-gateway/tests/setup.js'],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@ux-flow/common$': '<rootDir>/packages/common/src/index.js'
      },
      transform: {},
      collectCoverageFrom: [
        'services/api-gateway/src/**/*.js',
        '!services/api-gateway/src/server.js',
        '!services/api-gateway/src/index.js'
      ],
      coverageDirectory: 'services/api-gateway/coverage'
    },

    // Billing Service
    {
      displayName: 'billing-service', 
      testMatch: ['<rootDir>/services/billing-service/tests/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/services/billing-service/tests/setup.js'],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@ux-flow/common$': '<rootDir>/packages/common/src/index.js'
      },
      transform: {},
      collectCoverageFrom: [
        'services/billing-service/src/**/*.js',
        '!services/billing-service/src/server.js'
      ],
      coverageDirectory: 'services/billing-service/coverage'
    },

    // Cognitive Core Service
    {
      displayName: 'cognitive-core',
      testMatch: ['<rootDir>/services/cognitive-core/tests/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/services/cognitive-core/tests/setup.js'],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@ux-flow/common$': '<rootDir>/packages/common/src/index.js'
      },
      transform: {},
      collectCoverageFrom: [
        'services/cognitive-core/src/**/*.js',
        '!services/cognitive-core/src/server.js'
      ],
      coverageDirectory: 'services/cognitive-core/coverage',
      testTimeout: 30000 // Longer timeout for AI operations
    },

    // Flow Service
    {
      displayName: 'flow-service',
      testMatch: ['<rootDir>/services/flow-service/tests/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/services/flow-service/tests/setup.js'],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@ux-flow/common$': '<rootDir>/packages/common/src/index.js'
      },
      transform: {},
      collectCoverageFrom: [
        'services/flow-service/src/**/*.js',
        '!services/flow-service/src/server.js'
      ],
      coverageDirectory: 'services/flow-service/coverage'
    },

    // Knowledge Service
    {
      displayName: 'knowledge-service',
      testMatch: ['<rootDir>/services/knowledge-service/tests/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/services/knowledge-service/tests/setup.js'],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@ux-flow/common$': '<rootDir>/packages/common/src/index.js'
      },
      transform: {},
      collectCoverageFrom: [
        'services/knowledge-service/src/**/*.js',
        '!services/knowledge-service/src/server.js'
      ],
      coverageDirectory: 'services/knowledge-service/coverage'
    },

    // User Management Service
    {
      displayName: 'user-management',
      testMatch: ['<rootDir>/services/user-management/tests/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/services/user-management/tests/setup.js'],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@ux-flow/common$': '<rootDir>/packages/common/src/index.js'
      },
      transform: {},
      collectCoverageFrom: [
        'services/user-management/src/**/*.js',
        '!services/user-management/src/server.js'
      ],
      coverageDirectory: 'services/user-management/coverage'
    },

    // Integration Tests
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@ux-flow/common$': '<rootDir>/packages/common/src/index.js'
      },
      transform: {},
      testTimeout: 60000, // Longer timeout for integration tests
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    },

    // Common Package Tests
    {
      displayName: 'common',
      testMatch: ['<rootDir>/packages/common/tests/**/*.test.js'],
      testEnvironment: 'node',
      transform: {},
      collectCoverageFrom: [
        'packages/common/src/**/*.js',
        '!packages/common/src/**/*.test.js'
      ],
      coverageDirectory: 'packages/common/coverage'
    }
  ],

  // Global configuration
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.js'],
  globals: {
    'NODE_ENV': 'test'
  },
  preset: null,
  
  // Coverage configuration
  collectCoverageFrom: [
    'services/*/src/**/*.js',
    'packages/*/src/**/*.js',
    '!**/*.test.js',
    '!**/server.js',
    '!**/index.js',
    '!**/coverage/**',
    '!**/node_modules/**'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },

  // Coverage output
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'lcov'],

  // Test output
  verbose: false,
  testTimeout: 10000,
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/build/'
  ],

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Error handling
  errorOnDeprecated: true,
  
  // Performance
  maxWorkers: '50%'
};