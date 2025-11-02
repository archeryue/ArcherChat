/**
 * Jest Setup File
 * Runs before all tests
 */

// Set up environment variables for testing
process.env.NEXT_PUBLIC_USE_INTELLIGENT_ANALYSIS = 'true';
process.env.NEXT_PUBLIC_USE_WEB_SEARCH = 'false';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Keep error and warn for debugging
  // log: jest.fn(), // Uncomment to suppress logs
  // debug: jest.fn(),
  // info: jest.fn(),
};
