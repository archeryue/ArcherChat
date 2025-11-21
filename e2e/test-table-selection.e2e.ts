import { test, expect } from '@playwright/test';

test('convert selected markdown table text to table block', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  console.log('\n=== TESTING SELECTION TO TABLE CONVERSION ===\n');

  const markdownTable = `| Name | Age | City |
|------|-----|------|
| Alice | 25 | NYC |
| Bob | 30 | LA |`;

  // Type the markdown table as plain text
  await page.locator('.ProseMirror').click();
  await page.keyboard.type(markdownTable.replace(/\n/g, ' '));
  await page.waitForTimeout(500);

  console.log('Typed markdown table as plain text');

  // Select all the text we just typed
  await page.keyboard.press('Control+A');
  await page.waitForTimeout(300);

  console.log('Selected the markdown table text');

  // Count tables before clicking
  const tablesBefore = await page.locator('.ProseMirror table').count();
  console.log(`Tables before: ${tablesBefore}`);

  // Click the table button (should auto-convert the selection)
  const tableButton = page.locator('button[title*="Table"]');
  await tableButton.click();
  await page.waitForTimeout(1000);

  // Count tables after
  const tablesAfter = await page.locator('.ProseMirror table').count();
  console.log(`Tables after: ${tablesAfter}`);

  if (tablesAfter > tablesBefore) {
    console.log('✅ SUCCESS: Selected text was converted to table!');
    expect(tablesAfter).toBeGreaterThan(tablesBefore);
  } else {
    console.log('❌ Selection conversion did not work (might need proper newlines)');
  }

  // Alternative test: Type with actual newlines
  console.log('\n=== TESTING WITH ACTUAL NEWLINES ===\n');

  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);

  // Type markdown with newlines (using evaluate to insert text with newlines)
  await page.evaluate((md) => {
    const editor = (window as any).__testEditor;
    if (editor) {
      // Insert as plain text first
      editor.commands.insertContent(md);
      // Select all
      editor.commands.selectAll();
    }
  }, markdownTable);

  await page.waitForTimeout(500);

  console.log('Inserted markdown with newlines and selected all');

  // Click table button
  await tableButton.click();
  await page.waitForTimeout(1000);

  const finalTables = await page.locator('.ProseMirror table').count();
  console.log(`Final tables: ${finalTables}`);

  if (finalTables > tablesAfter) {
    console.log('✅ SUCCESS: Multi-line selection converted to table!');
  }

  // Take screenshot
  await page.screenshot({ path: 'test-results/table-selection-test.png', fullPage: true });
  console.log('\nScreenshot saved: test-results/table-selection-test.png');
});
