/**
 * Global test setup file
 * Runs before all tests
 */

import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Global test utilities
global.testUtils = {
  /**
   * Generate random session ID
   */
  randomSessionId: () => `test-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

  /**
   * Generate random message ID
   */
  randomMessageId: () => `test-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

  /**
   * Generate random phone number
   */
  randomPhone: () => `55119${Math.floor(10000000 + Math.random() * 90000000)}@s.whatsapp.net`,

  /**
   * Sleep utility for async tests
   */
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Wait for condition with timeout
   */
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  }
};

// Global beforeAll
beforeAll(async () => {
  console.log('🧪 Starting test suite...');
});

// Global afterAll
afterAll(async () => {
  console.log('✅ Test suite completed');
});
