import { test } from '@playwright/test';

test('check math node name', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('Mock update')) {
      console.log('UPDATE LOG:', msg.text());
    }
  });
  
  await page.goto('/whim-test');
  await page.waitForTimeout(2000);
  
  // Insert inline math
  page.once('dialog', async (dialog) => {
    await dialog.accept('x^2');
  });
  
  const mathButton = page.locator('button[title*="Math Formula (Inline)"]');
  await mathButton.click();
  await page.waitForTimeout(3000); // Wait for auto-save
});
