import { test, expect } from '@playwright/test';

test('parse markdown table and convert to table block', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  console.log('\n=== TESTING MARKDOWN TABLE PARSING ===\n');

  // Click into the editor
  await page.locator('.ProseMirror').click();
  await page.waitForTimeout(500);

  // Type markdown table
  const markdownTable = `
| Name | Age | City |
|------|-----|------|
| Alice | 25 | NYC |
| Bob | 30 | LA |
  `.trim();

  console.log('Typing markdown table:');
  console.log(markdownTable);

  await page.keyboard.type(markdownTable);
  await page.waitForTimeout(1000);

  // Check if table was created
  const tables = await page.locator('.ProseMirror table').count();
  console.log(`\nTables found in editor: ${tables}`);

  // Get the HTML to see what was created
  const editorHTML = await page.locator('.ProseMirror').innerHTML();
  console.log('\nEditor HTML (first 500 chars):');
  console.log(editorHTML.substring(0, 500));

  // Alternative: Try pasting markdown table
  console.log('\n=== TRYING PASTE METHOD ===\n');

  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);

  // Set clipboard content and paste
  await page.evaluate((md) => {
    navigator.clipboard.writeText(md);
  }, markdownTable);

  await page.keyboard.press('Control+V');
  await page.waitForTimeout(1000);

  const tablesAfterPaste = await page.locator('.ProseMirror table').count();
  console.log(`Tables after paste: ${tablesAfterPaste}`);

  const htmlAfterPaste = await page.locator('.ProseMirror').innerHTML();
  console.log('\nEditor HTML after paste (first 500 chars):');
  console.log(htmlAfterPaste.substring(0, 500));

  // Take screenshot
  await page.screenshot({ path: 'test-results/markdown-table-test.png' });
  console.log('\nScreenshot saved: test-results/markdown-table-test.png');

  if (tablesAfterPaste > 0) {
    console.log('\n✅ SUCCESS: Markdown table was converted to table block!');
  } else {
    console.log('\n❌ Markdown table was NOT converted. Checking if manual conversion is needed...');
  }
});
