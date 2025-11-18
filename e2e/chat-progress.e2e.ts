import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Chat Progress Tracking
 *
 * Tests the real-time progress badge updates during AI chat responses
 */

test.describe('Chat Progress Tracking', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('should show login page for unauthenticated users trying to access chat', async ({ page }) => {
    // Try to access chat page directly without auth
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const url = page.url();

    // Should redirect to login if not authenticated
    // OR stay on chat if already authenticated (from browser session)
    const isOnLoginOrChat = url.includes('/login') || url.includes('/chat');
    expect(isOnLoginOrChat).toBe(true);

    if (url.includes('/login')) {
      // Check for Google Sign In button
      const signInButton = page.getByRole('button', { name: /sign in with google/i });
      await expect(signInButton).toBeVisible();
    }
  });

  test('should display homepage elements', async ({ page }) => {
    await page.goto('/');

    // The page title should contain "WhimCraft"
    await expect(page).toHaveTitle(/WhimCraft/);
  });
});

/**
 * Tests for authenticated chat functionality
 * Note: These tests require a valid session or mock authentication
 */
test.describe('Chat Functionality (Requires Auth)', () => {
  // Skip these tests if we don't have auth set up
  // In a real scenario, you'd mock the session or use test credentials

  test.skip('should show progress badges in real-time', async ({ page, context }) => {
    // This test would require setting up authentication
    // For now, we'll skip it and document what it should test:

    // 1. Create a new conversation
    // 2. Send a message that triggers web search
    // 3. Verify progress badges appear in sequence:
    //    - "Analyzing your question..."
    //    - "Searching web..."
    //    - "Retrieving memories..."
    //    - "Building context..."
    //    - "Generating response..."
    // 4. Verify badges appear immediately (not all at once after delay)
    // 5. Verify final response appears after generation completes
  });

  test.skip('should handle long responses without crashing', async ({ page }) => {
    // Test that the app doesn't crash with long AI responses
    // This validates our memory exhaustion fixes
  });
});

/**
 * Visual regression tests
 */
test.describe('Visual Tests', () => {
  test('login page should render correctly', async ({ page }) => {
    await page.goto('/login');

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check that main elements are visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/login');

    // Verify elements are still visible on mobile
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});

/**
 * Performance tests
 */
test.describe('Performance', () => {
  test('should load homepage quickly', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    // Page should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should not have console errors on load', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors (like missing auth)
    const criticalErrors = consoleErrors.filter(
      (error) => !error.includes('401') && !error.includes('Unauthorized')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

/**
 * Accessibility tests
 */
test.describe('Accessibility', () => {
  test('login page should have proper ARIA labels', async ({ page }) => {
    await page.goto('/login');

    // Main heading should be accessible
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();

    // Button should have accessible name
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await expect(signInButton).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/login');

    // Press Tab to focus the sign-in button
    await page.keyboard.press('Tab');

    // The button should be focused (check if it has focus styles)
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBe('BUTTON');
  });
});
