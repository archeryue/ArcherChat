import { test } from '@playwright/test';

test('screenshot images and code sections', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  // Take full page screenshot
  await page.screenshot({ path: 'test-results/full-page.png', fullPage: true });
  console.log('Full page screenshot saved');

  // Scroll to images section
  await page.locator('text=🖼️ Images').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/images-section.png' });
  console.log('Images section screenshot saved');

  // Scroll to code section
  await page.locator('text=💻 Code Blocks').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/code-section.png' });
  console.log('Code section screenshot saved');

  // Check code block styling
  const codeBlock = await page.locator('.ProseMirror pre code').first();
  const bgColor = await codeBlock.evaluate(el => {
    return window.getComputedStyle(el).backgroundColor;
  });
  console.log('Code block background color:', bgColor);

  // Check for highlighted spans
  const highlightedSpans = await page.locator('.ProseMirror pre code .hljs-keyword').count();
  console.log('Highlighted keyword spans found:', highlightedSpans);
});
