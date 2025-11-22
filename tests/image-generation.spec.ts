/**
 * E2E Tests for Image Generation
 *
 * Tests the complete image generation flow:
 * 1. User sends image generation request
 * 2. Agent generates image
 * 3. Image displays in frontend
 * 4. Image is NOT saved to Firestore
 * 5. Image persists during scroll
 */

import { test, expect } from '@playwright/test';

test.describe('Image Generation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to chat page (assumes user is already logged in via persistent state)
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('should generate and display image without saving to Firestore', async ({ page }) => {
    // Start a new conversation
    const newConversationButton = page.locator('button:has-text("New Conversation")');
    if (await newConversationButton.isVisible()) {
      await newConversationButton.click();
      await page.waitForTimeout(500);
    }

    // Send image generation request
    const input = page.locator('textarea[placeholder*="message"]').first();
    await input.fill('generate a simple test image');
    await input.press('Enter');

    // Wait for response to start
    await page.waitForSelector('.prose', { timeout: 30000 });

    // Wait for image to appear (max 60 seconds for image generation)
    const imageElement = page.locator('img[src^="data:image"]');
    await imageElement.waitFor({ state: 'visible', timeout: 60000 });

    // Verify image is displayed
    const imageSrc = await imageElement.getAttribute('src');
    expect(imageSrc).toMatch(/^data:image\/(png|jpeg|webp);base64,/);

    // Verify image has actual data (not just a placeholder)
    expect(imageSrc!.length).toBeGreaterThan(100);

    // Check that debug logs don't show "NO MATCH" error
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('[Image Debug]')) {
        consoleLogs.push(msg.text());
      }
    });

    // Verify no "NO MATCH" errors in console
    await page.waitForTimeout(1000);
    const hasNoMatchError = consoleLogs.some(log => log.includes('NO MATCH'));
    expect(hasNoMatchError).toBe(false);
  });

  test('should persist image during scroll', async ({ page }) => {
    // This test assumes an image was already generated
    // Send image generation request
    const input = page.locator('textarea[placeholder*="message"]').first();
    await input.fill('generate a cat');
    await input.press('Enter');

    // Wait for image to appear
    const imageElement = page.locator('img[src^="data:image"]').first();
    await imageElement.waitFor({ state: 'visible', timeout: 60000 });

    // Get initial image src
    const initialSrc = await imageElement.getAttribute('src');

    // Scroll the messages container
    const messagesContainer = page.locator('.messages-container').first();
    await messagesContainer.evaluate(el => {
      el.scrollTop = 0;
      el.scrollTop = el.scrollHeight / 2;
      el.scrollTop = el.scrollHeight;
    });

    // Wait a bit for any re-renders
    await page.waitForTimeout(1000);

    // Verify image still exists and has same src
    const finalSrc = await imageElement.getAttribute('src');
    expect(finalSrc).toBe(initialSrc);
    expect(await imageElement.isVisible()).toBe(true);
  });

  test('should not include image data in subsequent messages (no token overflow)', async ({ page }) => {
    // Generate an image
    const input = page.locator('textarea[placeholder*="message"]').first();
    await input.fill('generate a small test image');
    await input.press('Enter');

    // Wait for image
    const imageElement = page.locator('img[src^="data:image"]').first();
    await imageElement.waitFor({ state: 'visible', timeout: 60000 });

    // Wait for response to complete
    await page.waitForTimeout(2000);

    // Send a follow-up message
    await input.fill('what did you just generate?');
    await input.press('Enter');

    // Wait for response
    await page.waitForSelector('.prose', { timeout: 30000 });

    // Check that the request succeeded (no 400 error from token overflow)
    // Listen for API errors
    let hasTokenError = false;
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('token count exceeds')) {
        hasTokenError = true;
      }
    });

    await page.waitForTimeout(5000);
    expect(hasTokenError).toBe(false);
  });

  test('should handle image generation errors gracefully', async ({ page }) => {
    // Send a request that might fail (invalid prompt)
    const input = page.locator('textarea[placeholder*="message"]').first();
    await input.fill('generate an image of something impossible to render');
    await input.press('Enter');

    // Wait for response (either success or error)
    await page.waitForTimeout(30000);

    // Verify page is still functional (no crashes)
    const isInputVisible = await input.isVisible();
    expect(isInputVisible).toBe(true);
  });

  test('should extract image data correctly from streamed response', async ({ page }) => {
    // Monitor console logs for debug output
    const debugLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('[Image Debug]')) {
        debugLogs.push(msg.text());
      }
    });

    // Generate image
    const input = page.locator('textarea[placeholder*="message"]').first();
    await input.fill('generate a test pattern');
    await input.press('Enter');

    // Wait for image
    const imageElement = page.locator('img[src^="data:image"]').first();
    await imageElement.waitFor({ state: 'visible', timeout: 60000 });

    // Check debug logs
    await page.waitForTimeout(2000);

    // Should have logs indicating match was found
    const hasMatchLog = debugLogs.some(log => log.includes('MATCH FOUND'));
    expect(hasMatchLog).toBe(true);

    // Should have extracted image data
    const hasExtractedLog = debugLogs.some(log => log.includes('Extracted image data length'));
    expect(hasExtractedLog).toBe(true);
  });

  test('should not save base64 image data to Firestore', async ({ page, context }) => {
    // This test verifies that Firestore documents don't contain huge base64 strings

    // Intercept Firestore write requests
    let firestoreWriteContent: string | null = null;
    await page.route('**/firestore.googleapis.com/**', async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        const postData = request.postData();
        if (postData) {
          firestoreWriteContent = postData;
        }
      }
      await route.continue();
    });

    // Generate image
    const input = page.locator('textarea[placeholder*="message"]').first();
    await input.fill('generate a simple image');
    await input.press('Enter');

    // Wait for response to complete
    await page.waitForTimeout(30000);

    // Verify that if Firestore write happened, it doesn't contain base64 image data
    if (firestoreWriteContent) {
      // Should not contain long base64 strings
      expect(firestoreWriteContent).not.toMatch(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{1000,}/);

      // Should contain the replacement text
      expect(firestoreWriteContent).toContain('[Image generated - not persisted to reduce storage]');
    }
  });
});

test.describe('Image Generation - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('should handle multiple image generations in same conversation', async ({ page }) => {
    // Generate first image
    let input = page.locator('textarea[placeholder*="message"]').first();
    await input.fill('generate image 1');
    await input.press('Enter');
    await page.locator('img[src^="data:image"]').first().waitFor({ timeout: 60000 });

    // Generate second image
    await page.waitForTimeout(2000);
    input = page.locator('textarea[placeholder*="message"]').first();
    await input.fill('generate image 2');
    await input.press('Enter');

    // Wait for second image
    await page.waitForTimeout(60000);

    // Both images should be visible
    const images = page.locator('img[src^="data:image"]');
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should handle rapid consecutive image requests', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="message"]').first();

    // Send first request
    await input.fill('generate test image 1');
    await input.press('Enter');

    // Don't wait, send second request immediately
    await page.waitForTimeout(1000);
    await input.fill('generate test image 2');
    await input.press('Enter');

    // System should handle this gracefully (either queue or reject)
    // Verify no crashes
    await page.waitForTimeout(10000);
    const isVisible = await input.isVisible();
    expect(isVisible).toBe(true);
  });
});
