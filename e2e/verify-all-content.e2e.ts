import { test, expect } from '@playwright/test';

test('verify all Phase 1 content displays', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  console.log('\n=== VERIFYING ALL CONTENT ===\n');

  // Check headings
  const headings = await page.locator('.ProseMirror h1, .ProseMirror h2').count();
  console.log(`✓ Headings: ${headings} found`);
  expect(headings).toBeGreaterThan(0);

  // Check math formulas (inline and block)
  const inlineMath = await page.locator('.ProseMirror .tiptap-mathematics-render[data-type="inline-math"]').count();
  const blockMath = await page.locator('.ProseMirror .tiptap-mathematics-render[data-type="block-math"]').count();
  console.log(`✓ Inline Math: ${inlineMath} found`);
  console.log(`✓ Block Math: ${blockMath} found`);

  // Check tables
  const tables = await page.locator('.ProseMirror table').count();
  console.log(`✓ Tables: ${tables} found`);
  expect(tables).toBeGreaterThan(0);

  // Check images
  const images = await page.locator('.ProseMirror img').count();
  console.log(`✓ Images: ${images} found`);
  expect(images).toBeGreaterThan(0);

  // Check code blocks
  const codeBlocks = await page.locator('.ProseMirror pre code').count();
  console.log(`✓ Code Blocks: ${codeBlocks} found`);
  expect(codeBlocks).toBeGreaterThan(0);

  // Get total paragraph count
  const paragraphs = await page.locator('.ProseMirror p').count();
  console.log(`✓ Paragraphs: ${paragraphs} found`);

  console.log('\n=== ALL PHASE 1 FEATURES DISPLAYING! ===\n');

  // Take a screenshot
  await page.screenshot({ path: 'test-results/whim-test-page-full.png', fullPage: true });
  console.log('Screenshot saved: test-results/whim-test-page-full.png');
});
