import { test } from '@playwright/test';

test('check if content is set', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Setting initial content')) {
      console.log('FOUND:', text);
    }
  });
  
  await page.goto('/whim-test');
  await page.waitForTimeout(4000);
  
  const content = await page.locator('.ProseMirror').textContent();
  console.log('Editor text content:', content?.substring(0, 100));
});
