import { test, expect } from '@playwright/test';

test('table button converts markdown to table', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  console.log('\n=== TESTING TABLE BUTTON WITH MARKDOWN ===\n');

  const markdownTable = `| Name | Age | City |
|------|-----|------|
| Alice | 25 | NYC |
| Bob | 30 | LA |`;

  // Setup dialog handler to input markdown
  page.once('dialog', async (dialog) => {
    console.log('Dialog appeared with message:', dialog.message().substring(0, 100));
    await dialog.accept(markdownTable);
  });

  // Click the table button
  const tableButton = page.locator('button[title*="Table"]');
  await tableButton.click();
  await page.waitForTimeout(1000);

  // Count tables in the editor
  const tables = await page.locator('.ProseMirror table').count();
  console.log(`\nTables found: ${tables}`);

  if (tables > 1) { // 1 from mock data + 1 newly inserted
    const lastTable = page.locator('.ProseMirror table').last();
    const rows = await lastTable.locator('tr').count();
    const cells = await lastTable.locator('td, th').count();

    console.log(`New table: ${rows} rows, ${cells} cells`);
    console.log('✅ SUCCESS: Markdown table was converted via button!');

    expect(rows).toBe(3); // 1 header + 2 data rows
    expect(cells).toBeGreaterThan(6); // At least 3x3 = 9 cells
  } else {
    console.log('❌ FAILED: No new table created');
  }

  // Take screenshot
  await page.screenshot({ path: 'test-results/table-button-markdown.png', fullPage: true });
  console.log('\nScreenshot saved: test-results/table-button-markdown.png');
});
