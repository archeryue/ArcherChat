/**
 * Playwright Authentication Setup
 *
 * This script runs before all E2E tests to authenticate the test user.
 * Uses the test auth provider (only available on localhost in development mode).
 *
 * SECURITY: Test auth provider requires:
 * - NODE_ENV=development
 * - ENABLE_TEST_AUTH=true
 * - Running on localhost (not deployed)
 */

import { test as setup, expect } from '@playwright/test';

const authFile = 'tests/.auth/user.json';

setup('authenticate as test user', async ({ page }) => {
  console.log('[E2E Setup] Authenticating test user...');

  // Navigate to sign-in page
  await page.goto('/api/auth/signin');

  // Wait for sign-in page to load
  await page.waitForLoadState('networkidle');

  // Check if test provider button is available
  const testProviderButton = page.locator('button:has-text("Test User")');

  if (await testProviderButton.isVisible()) {
    console.log('[E2E Setup] Test provider found - clicking...');

    // Click the test provider button
    await testProviderButton.click();

    // Wait for redirect to chat page
    await page.waitForURL('/chat', { timeout: 10000 });

    console.log('[E2E Setup] Successfully authenticated!');

    // Verify we're logged in
    const url = page.url();
    expect(url).toContain('/chat');

    // Save authentication state
    await page.context().storageState({ path: authFile });

    console.log('[E2E Setup] Auth state saved to:', authFile);
  } else {
    console.error('[E2E Setup] ERROR: Test provider not found!');
    console.error('[E2E Setup] Make sure:');
    console.error('[E2E Setup]   - NODE_ENV=development');
    console.error('[E2E Setup]   - ENABLE_TEST_AUTH=true');
    console.error('[E2E Setup]   - Running on localhost');

    // List available providers for debugging
    const buttons = await page.locator('button').all();
    console.error('[E2E Setup] Available buttons:', await Promise.all(
      buttons.map(b => b.textContent())
    ));

    throw new Error('Test auth provider not available - check environment');
  }
});
