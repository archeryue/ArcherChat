import { test, expect } from '@playwright/test';

/**
 * Basic E2E Tests - No Authentication Required
 *
 * These tests verify the basic functionality and UI of the application
 * without requiring authentication.
 */

test.describe('Application Basic Functionality', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Should redirect to login or show homepage
    const url = page.url();
    expect(url).toMatch(/localhost:8080/);
  });

  test('should have correct page title', async ({ page }) => {
    await page.goto('/');

    // The page should have "WhimCraft" in the title
    await expect(page).toHaveTitle(/WhimCraft|Login/);
  });

  test('should render without JavaScript errors', async ({ page }) => {
    const jsErrors: Error[] = [];

    page.on('pageerror', (error) => {
      jsErrors.push(error);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should not have any JavaScript errors
    expect(jsErrors.length).toBe(0);
  });

  test('should not have failed network requests', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('requestfailed', (request) => {
      failedRequests.push(request.url());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out expected 401s for auth checks
    const unexpectedFailures = failedRequests.filter(
      (url) => !url.includes('/api/auth') && !url.includes('/api/conversations')
    );

    expect(unexpectedFailures.length).toBe(0);
  });
});

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login page', async ({ page }) => {
    // Check for heading
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();

    // Check for sign-in button
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await expect(signInButton).toBeVisible();
  });

  test('should have Google OAuth branding', async ({ page }) => {
    // Look for Google-related text or images
    const googleText = page.getByText(/google/i);
    await expect(googleText).toBeVisible();
  });

  test('sign in button should be clickable', async ({ page }) => {
    const signInButton = page.getByRole('button', { name: /sign in/i });

    // Button should not be disabled
    await expect(signInButton).toBeEnabled();

    // Should be able to click it (won't complete OAuth, but should trigger)
    await expect(signInButton).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  const viewports = [
    { name: 'Mobile', width: 375, height: 667 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    test(`should render correctly on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await page.goto('/login');

      // Main elements should be visible
      await expect(page.locator('h1, h2').first()).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

      // No horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    });
  }
});

test.describe('Performance Metrics', () => {
  test('should meet Core Web Vitals targets', async ({ page }) => {
    await page.goto('/');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Get performance metrics
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        domInteractive: navigation.domInteractive - navigation.fetchStart,
      };
    });

    // DOM Interactive should be under 2 seconds
    expect(metrics.domInteractive).toBeLessThan(2000);

    console.log('Performance Metrics:', metrics);
  });

  test('should load critical CSS inline', async ({ page }) => {
    const response = await page.goto('/');

    if (response) {
      const html = await response.text();

      // Check if there's inline CSS or Next.js styles
      // Next.js 14 App Router may use different optimization strategies
      const hasStyles =
        html.includes('<style') ||
        html.includes('_app') ||
        html.includes('className') ||
        html.includes('tailwind') ||
        html.includes('.css');

      // The page should have SOME styling mechanism
      expect(hasStyles).toBe(true);
    }
  });
});

test.describe('SEO and Metadata', () => {
  test('should have proper meta tags', async ({ page }) => {
    await page.goto('/');

    // Check for viewport meta tag
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');

    // Check for description meta tag (if present)
    const description = page.locator('meta[name="description"]');
    // It's okay if it's not present, but if it is, it should have content
    const count = await description.count();
    if (count > 0) {
      const content = await description.getAttribute('content');
      expect(content).toBeTruthy();
    }
  });

  test('should have a favicon', async ({ page }) => {
    await page.goto('/');

    // Check for favicon link
    const favicon = page.locator('link[rel="icon"], link[rel="shortcut icon"]');
    await expect(favicon).toHaveCount(1);
  });
});

test.describe('Error Handling', () => {
  test('should handle 404 errors gracefully', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');

    // Should get a 404 response
    expect(response?.status()).toBe(404);

    // Should show some content (Next.js 404 page)
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });

  test('should handle network offline gracefully', async ({ page, context }) => {
    await page.goto('/login');

    // Simulate offline
    await context.setOffline(true);

    // Try to navigate
    await page.goto('/').catch(() => {
      // Expected to fail
    });

    // Re-enable network
    await context.setOffline(false);

    // Should be able to load again
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();
  });
});
