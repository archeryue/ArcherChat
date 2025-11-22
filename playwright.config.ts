import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for WhimCraft E2E tests
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './',
  testMatch: ['e2e/**/*.e2e.ts', 'tests/**/*.spec.ts'],

  // Maximum time one test can run for
  timeout: 60 * 1000,

  // Run tests in files in parallel
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter to use
  reporter: 'html',

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: 'http://localhost:8080',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    // Setup project - runs authentication before tests
    {
      name: 'setup',
      testMatch: 'tests/auth.setup.ts',
    },

    // Chromium tests - uses authenticated state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use authenticated state from setup
        storageState: 'tests/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    cwd: './', // Ensure command runs from project root where .env files are
    reuseExistingServer: false, // Force fresh server with ENABLE_TEST_AUTH from .env.development.local
    stdout: 'pipe', // Capture stdout for debugging
    stderr: 'pipe', // Capture stderr for debugging
    timeout: 120 * 1000,
  },
});
