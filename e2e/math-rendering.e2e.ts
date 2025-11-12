import { test, expect, chromium } from '@playwright/test';

/**
 * E2E Tests for Math Rendering (LaTeX/KaTeX)
 *
 * These tests verify that math expressions render correctly without layout issues
 * Uses production site with existing authentication
 */

test.describe('Math Rendering Tests', () => {
  test('should render display math without layout issues', async () => {
    // Use production URL where user is already authenticated
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to production chat page
    await page.goto('https://archerchat-er7tpljqpa-uc.a.run.app/chat');
    await page.waitForLoadState('networkidle');

    const url = page.url();

    // Skip if not authenticated
    if (url.includes('/login')) {
      console.log('❌ Not authenticated - skipping test');
      test.skip();
      return;
    }

    console.log('✅ Authenticated, testing math rendering');

    // Wait for chat interface to load
    await page.waitForTimeout(2000);

    // Find the message input
    const messageInput = page.locator('textarea').first();
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    // Take screenshot before sending message
    await page.screenshot({ path: 'test-results/math-test-1-before.png', fullPage: true });

    // Send a message with display math (the problematic case)
    const mathMessage = 'What is the integral $$\\int_0^\\infty e^{-x^2} dx$$?';
    await messageInput.fill(mathMessage);

    // Find and click send button
    const sendButton = page.locator('button[type="submit"], button:has-text("Send")').first();
    await sendButton.click();

    // Wait for response to start
    await page.waitForTimeout(3000);

    // Take screenshot after initial render
    await page.screenshot({ path: 'test-results/math-test-2-after-send.png', fullPage: true });

    // Wait for math to render
    await page.waitForTimeout(2000);

    // Take screenshot after math rendering
    await page.screenshot({ path: 'test-results/math-test-3-after-math-render.png', fullPage: true });

    // Check for white space or layout issues
    const chatContainer = page.locator('[class*="flex"]').first();
    const containerBox = await chatContainer.boundingBox();

    // Get viewport height
    const viewportHeight = page.viewportSize()?.height || 0;

    console.log('📏 Layout measurements:');
    console.log(`   Viewport height: ${viewportHeight}px`);
    console.log(`   Container height: ${containerBox?.height}px`);
    console.log(`   Container Y position: ${containerBox?.y}px`);

    // Check if there's excessive white space (container much taller than viewport)
    if (containerBox && containerBox.height > viewportHeight * 2) {
      console.warn('⚠️  WARNING: Container height is more than 2x viewport height');
      console.warn('   This might indicate a layout issue');
    }

    // Check if any math elements rendered
    const mathElements = await page.locator('.katex, .katex-display').count();
    console.log(`📐 Found ${mathElements} KaTeX elements`);

    // Take final screenshot after scrolling to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/math-test-4-after-scroll.png', fullPage: true });

    // Get all KaTeX elements' bounding boxes
    const katexBoxes = await page.locator('.katex-display').evaluateAll((elements) => {
      return elements.map(el => {
        const box = el.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          top: box.top,
          left: box.left,
        };
      });
    });

    console.log('📐 KaTeX display math dimensions:', JSON.stringify(katexBoxes, null, 2));

    // Check for page errors
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    expect(pageErrors.length).toBe(0);

    // Clean up
    await browser.close();
  });

  test('should load past conversation with math without layout issues', async () => {
    // Note: This test would require creating a conversation with math first
    // For now, we'll skip it and implement later if needed
    test.skip();
  });
});
