/**
 * Jest Configuration for User Management Service
 */

export default {
  // Use native ES modules
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {},
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/server.js',
    '!src/config/**'
  ],
  
  coverageDirectory: 'coverage',
  
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Module directories
  moduleDirectories: ['node_modules', 'src'],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks between tests
  restoreMocks: true,
  
  // Timeout for tests
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Global variables
  globals: {
    'NODE_ENV': 'test'
  }
};