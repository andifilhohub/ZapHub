export default {
  // Test environment
  testEnvironment: 'node',

  // File extensions
  moduleFileExtensions: ['js', 'json'],

  // Transform (none needed for pure ESM)
  transform: {},

  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server/app.js', // Exclude server entry
    '!src/workers/index.js', // Exclude workers entry
    '!**/node_modules/**',
    '!**/tests/**'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 75,
      statements: 75
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Module paths
  modulePaths: ['<rootDir>'],

  // Timeout
  testTimeout: 30000, // 30s for integration tests

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Detect open handles
  detectOpenHandles: true,
  forceExit: true
};
