import { test } from '@playwright/test';

test('check for browser errors', async ({ page }) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      errors.push(text);
      console.log('ERROR:', text);
    } else if (msg.type() === 'warning') {
      warnings.push(text);
    } else if (text.includes('getInitialContent') || text.includes('editor')) {
      console.log('LOG:', text);
    }
  });
  
  page.on('pageerror', error => {
    errors.push(error.message);
    console.log('PAGE ERROR:', error.message);
  });
  
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);
  
  console.log(`\nTotal errors: ${errors.length}, warnings: ${warnings.length}`);
});
