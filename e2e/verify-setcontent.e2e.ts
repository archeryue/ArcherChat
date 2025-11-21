import { test } from '@playwright/test';

test('verify setContent worked', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Setting initial') || text.includes('Content after')) {
      console.log('LOG:', text);
    }
  });
  
  await page.goto('/whim-test');
  await page.waitForTimeout(4000);
  
  const headings = await page.locator('.ProseMirror h1, .ProseMirror h2').count();
  console.log('Headings found:', headings);
});
