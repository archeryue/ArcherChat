import { test } from '@playwright/test';

test('debug initial content loading', async ({ page }) => {
  // Capture console logs
  page.on('console', msg => {
    if (msg.text().includes('whim data') || msg.text().includes('getInitialContent')) {
      console.log('BROWSER LOG:', msg.text());
    }
  });
  
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);
  
  console.log('Page loaded');
});
