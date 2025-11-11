import { Page } from '@playwright/test';

/**
 * Authentication helpers for E2E tests
 *
 * Note: In a real production test environment, you would either:
 * 1. Use test credentials with OAuth provider's test mode
 * 2. Mock the NextAuth session using browser storage
 * 3. Use a test-specific authentication bypass
 */

/**
 * Mock authentication by setting session cookie
 * This is a simplified version - real implementation would need valid session tokens
 */
export async function mockAuthentication(page: Page, userId = 'test-user-123') {
  // In a real scenario, you would:
  // 1. Generate a valid NextAuth session token
  // 2. Set it in the cookies/localStorage
  // 3. Ensure the backend recognizes it

  // For now, this is a placeholder that demonstrates the approach
  await page.context().addCookies([
    {
      name: 'next-auth.session-token',
      value: 'mock-session-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  // Navigate to the root and check if we're redirected to login
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const url = page.url();
  return !url.includes('/login');
}

/**
 * Wait for authentication to complete
 */
export async function waitForAuth(page: Page, timeout = 30000) {
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout,
  });
}

/**
 * Logout helper
 */
export async function logout(page: Page) {
  // Click logout button if visible
  const logoutButton = page.getByRole('button', { name: /logout|sign out/i });

  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  }

  // Clear all cookies
  await page.context().clearCookies();
}
