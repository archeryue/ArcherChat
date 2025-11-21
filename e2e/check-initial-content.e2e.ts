import { test } from '@playwright/test';

test('check initial content', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(2000);
  
  // Check what's in the editor
  const editorContent = await page.locator('.ProseMirror').textContent();
  console.log('Editor content:', editorContent);
  
  // Check for specific elements
  const headings = await page.locator('.ProseMirror h1, .ProseMirror h2').count();
  const paragraphs = await page.locator('.ProseMirror p').count();
  const math = await page.locator('.katex, [data-type*="math"]').count();
  const tables = await page.locator('.ProseMirror table').count();
  const images = await page.locator('.ProseMirror img[src]').count();
  const codeBlocks = await page.locator('.ProseMirror pre code').count();
  
  console.log('Found:', {
    headings,
    paragraphs,
    math,
    tables,
    images,
    codeBlocks
  });
  
  // Scroll down and take screenshot
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'test-results/whim-editor-scrolled.png',
    fullPage: true,
  });
});
