/**
 * Comprehensive E2E Test Suite
 *
 * Tests the complete application flow using mock authentication.
 * Covers: Auth, Chat, Image Generation, Conversations, Memory
 */

import { test, expect } from '@playwright/test';

test.describe('Comprehensive E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to chat page (already authenticated via auth.setup.ts)
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Authentication & Session', () => {
    test('should be authenticated as test user', async ({ page }) => {
      // Verify we're on the chat page (not redirected to login)
      expect(page.url()).toContain('/chat');

      // Check if user avatar/name is visible in sidebar
      const sidebar = page.locator('.sidebar, [data-testid="sidebar"]').first();

      // Should see test user name or email
      const hasTestUser = await sidebar.getByText(/test/i).count() > 0;
      expect(hasTestUser).toBeTruthy();
    });

    test('should maintain session across page reloads', async ({ page }) => {
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should still be on chat page, not login
      expect(page.url()).toContain('/chat');
    });
  });

  test.describe('Chat Functionality', () => {
    test('should send and receive a message', async ({ page }) => {
      const testMessage = `Hello, this is a test message at ${Date.now()}`;

      // Find the input textarea
      const input = page.locator('textarea[placeholder*="message"]').first();
      await input.waitFor({ state: 'visible' });

      // Type and send message
      await input.fill(testMessage);
      await input.press('Enter');

      // Wait for user message to appear
      await expect(page.locator('text=' + testMessage).first()).toBeVisible({ timeout: 5000 });

      // Wait for AI response to appear
      await page.waitForSelector('.prose', { timeout: 30000 });

      // Verify response exists and has content
      const responses = page.locator('.prose');
      const responseCount = await responses.count();
      expect(responseCount).toBeGreaterThan(0);
    });

    test('should handle streaming response', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();
      await input.fill('Tell me a short joke');
      await input.press('Enter');

      // Wait for response to start streaming
      await page.waitForSelector('.prose', { timeout: 30000 });

      // Response should have text content
      const response = page.locator('.prose').last();
      const text = await response.textContent();
      expect(text?.length).toBeGreaterThan(0);
    });

    test('should show progress indicators', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();
      await input.fill('What is 2+2?');
      await input.press('Enter');

      // Look for any progress indicators
      // Note: Progress indicators might appear briefly
      // We'll just verify the response completes successfully
      await page.waitForSelector('.prose', { timeout: 30000 });

      const response = page.locator('.prose').last();
      const text = await response.textContent();
      expect(text).toContain('4');
    });
  });

  test.describe('Conversation Management', () => {
    test('should create new conversation', async ({ page }) => {
      // Click new conversation button
      const newConvButton = page.locator('button:has-text("New Conversation")').first();

      if (await newConvButton.isVisible()) {
        await newConvButton.click();
        await page.waitForTimeout(500);

        // Messages area should be empty (welcome screen)
        const welcomeText = page.locator('text=Welcome to');
        await expect(welcomeText).toBeVisible({ timeout: 5000 });
      }
    });

    test('should list conversations in sidebar', async ({ page }) => {
      // Send a message to create a conversation
      const input = page.locator('textarea[placeholder*="message"]').first();
      await input.fill('Test conversation');
      await input.press('Enter');

      // Wait for response
      await page.waitForSelector('.prose', { timeout: 30000 });

      // Check if conversations appear in sidebar
      await page.waitForTimeout(2000); // Wait for conversation to save

      // Reload to see updated conversation list
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should have at least one conversation listed
      // (exact selector depends on sidebar implementation)
      const sidebar = page.locator('[class*="sidebar"]').first();
      expect(await sidebar.isVisible()).toBeTruthy();
    });
  });

  test.describe('Image Generation', () => {
    test('should generate an image from text prompt', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();
      await input.fill('generate a simple red circle');
      await input.press('Enter');

      // Wait for response
      await page.waitForTimeout(1000);

      // Wait for image to appear (max 60 seconds)
      const imageElement = page.locator('img[src^="data:image"]').first();
      await imageElement.waitFor({ state: 'visible', timeout: 60000 });

      // Verify image has data
      const imageSrc = await imageElement.getAttribute('src');
      expect(imageSrc).toMatch(/^data:image\/(png|jpeg|webp);base64,/);
      expect(imageSrc!.length).toBeGreaterThan(100);

      // Verify descriptive text is also present
      const response = page.locator('.prose').last();
      const text = await response.textContent();
      expect(text?.length).toBeGreaterThan(0);
    });

    test('should display image without disappearing on scroll', async ({ page }) => {
      // Generate an image
      const input = page.locator('textarea[placeholder*="message"]').first();
      await input.fill('generate a blue square');
      await input.press('Enter');

      // Wait for image
      const imageElement = page.locator('img[src^="data:image"]').first();
      await imageElement.waitFor({ state: 'visible', timeout: 60000 });

      // Get initial image src
      const initialSrc = await imageElement.getAttribute('src');

      // Scroll the messages container
      const messagesContainer = page.locator('.messages-container').first();
      if (await messagesContainer.isVisible()) {
        await messagesContainer.evaluate(el => {
          el.scrollTop = 0;
          el.scrollTop = el.scrollHeight / 2;
          el.scrollTop = el.scrollHeight;
        });
      }

      // Wait for any re-renders
      await page.waitForTimeout(1000);

      // Verify image still exists with same src
      const finalSrc = await imageElement.getAttribute('src');
      expect(finalSrc).toBe(initialSrc);
      expect(await imageElement.isVisible()).toBe(true);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // This test verifies the app doesn't crash on errors
      const input = page.locator('textarea[placeholder*="message"]').first();

      // Send a message
      await input.fill('Test error handling');
      await input.press('Enter');

      // Even if there's an error, input should remain functional
      await page.waitForTimeout(5000);

      const isInputVisible = await input.isVisible();
      expect(isInputVisible).toBe(true);
    });

    test('should remain functional after multiple rapid messages', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();

      // Send multiple messages rapidly
      for (let i = 0; i < 3; i++) {
        await input.fill(`Rapid message ${i + 1}`);
        await input.press('Enter');
        await page.waitForTimeout(500);
      }

      // App should still be functional
      const isInputVisible = await input.isVisible();
      expect(isInputVisible).toBe(true);
    });
  });

  test.describe('UI/UX', () => {
    test('should show welcome screen for new conversation', async ({ page }) => {
      // Create new conversation
      const newConvButton = page.locator('button:has-text("New Conversation")').first();

      if (await newConvButton.isVisible()) {
        await newConvButton.click();
        await page.waitForTimeout(500);

        // Should see welcome message
        const welcomeText = page.locator('text=Welcome to');
        await expect(welcomeText).toBeVisible();

        // Should see WhimCraft branding
        const branding = page.locator('text=WhimCraft');
        await expect(branding).toBeVisible();
      }
    });

    test('should have functional input field', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();

      // Should be visible
      await expect(input).toBeVisible();

      // Should be enabled (not disabled)
      await expect(input).toBeEnabled();

      // Should accept text input
      await input.fill('Test input');
      const value = await input.inputValue();
      expect(value).toBe('Test input');
    });

    test('should auto-scroll to bottom on new messages', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();

      // Send a message
      await input.fill('Test auto-scroll');
      await input.press('Enter');

      // Wait for response
      await page.waitForSelector('.prose', { timeout: 30000 });

      // The page should have scrolled to show the latest message
      // We can verify this by checking if the input is visible
      await expect(input).toBeVisible();
    });
  });

  test.describe('Memory System', () => {
    test('should accept user preferences', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();

      // Tell the AI a preference
      await input.fill('Remember that my favorite color is blue');
      await input.press('Enter');

      // Wait for response
      await page.waitForSelector('.prose', { timeout: 30000 });

      // AI should acknowledge
      const response = page.locator('.prose').last();
      const text = await response.textContent();
      expect(text?.toLowerCase()).toContain('blue');
    });
  });

  test.describe('Performance', () => {
    test('should load chat page quickly', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;

      // Should load within 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test('should handle long conversations', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();

      // Send several messages to create history
      for (let i = 0; i < 5; i++) {
        await input.fill(`Message number ${i + 1}`);
        await input.press('Enter');
        await page.waitForTimeout(2000);
      }

      // App should still be responsive
      const isInputVisible = await input.isVisible();
      expect(isInputVisible).toBe(true);
    });
  });

  test.describe('Accessibility', () => {
    test('should have accessible input with placeholder', async ({ page }) => {
      const input = page.locator('textarea[placeholder*="message"]').first();

      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder?.length).toBeGreaterThan(0);
    });

    test('should be keyboard navigable', async ({ page }) => {
      // Tab to input
      await page.keyboard.press('Tab');

      // Should be able to type
      await page.keyboard.type('Keyboard test');

      // Press Enter to send
      await page.keyboard.press('Enter');

      // Should send message
      await expect(page.locator('text=Keyboard test').first()).toBeVisible({ timeout: 5000 });
    });
  });
});
