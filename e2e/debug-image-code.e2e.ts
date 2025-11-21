import { test } from '@playwright/test';

test('debug images and code blocks', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  console.log('\n=== CHECKING IMAGES ===');

  // Check image elements
  const images = await page.locator('.ProseMirror img').all();
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const src = await img.getAttribute('src');
    const alt = await img.getAttribute('alt');
    const isVisible = await img.isVisible();
    console.log(`Image ${i + 1}:`, { src: src?.substring(0, 50), alt, isVisible });
  }

  console.log('\n=== CHECKING CODE BLOCKS ===');

  // Check code block structure
  const codeBlocks = await page.locator('.ProseMirror pre').all();
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    const html = await block.innerHTML();
    const hasHighlightClass = html.includes('hljs') || html.includes('language-');
    console.log(`Code Block ${i + 1}:`, {
      hasHighlightClass,
      innerHTML: html.substring(0, 100) + '...'
    });
  }

  // Take screenshots
  await page.screenshot({ path: 'test-results/debug-images.png', fullPage: true });
  console.log('\nScreenshot saved: test-results/debug-images.png');
});
