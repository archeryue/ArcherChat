import { test, expect } from '@playwright/test';

test('directly insert markdown table using editor command', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  console.log('\n=== TESTING DIRECT MARKDOWN INSERTION ===\n');

  const markdownTable = `
| Name | Age | City |
|------|-----|------|
| Alice | 25 | NYC |
| Bob | 30 | LA |
  `.trim();

  // Use the editor's insertContent command directly
  const result = await page.evaluate((md) => {
    const editor = (window as any).__testEditor;
    if (!editor) {
      return { error: 'Editor not found' };
    }

    try {
      // Insert markdown with contentType: 'markdown'
      editor.commands.insertContent(md, {
        contentType: 'markdown',
      });

      // Wait a bit for the content to be inserted
      setTimeout(() => {
        const json = editor.getJSON();
        console.log('Editor JSON after insert:', JSON.stringify(json, null, 2));
      }, 100);

      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }, markdownTable);

  console.log('Insert result:', result);

  await page.waitForTimeout(500);

  // Check if table was created
  const tables = await page.locator('.ProseMirror table').count();
  console.log(`\nTables found: ${tables}`);

  // Check table structure
  if (tables > 0) {
    const rows = await page.locator('.ProseMirror table tr').count();
    const cells = await page.locator('.ProseMirror table td, .ProseMirror table th').count();
    console.log(`Table rows: ${rows}, cells: ${cells}`);

    console.log('\n✅ SUCCESS: Markdown table was converted!');
    expect(tables).toBeGreaterThan(0);
  } else {
    console.log('\n❌ FAILED: No table created');
  }

  // Take screenshot
  await page.screenshot({ path: 'test-results/markdown-direct-test.png', fullPage: true });
  console.log('\nScreenshot saved: test-results/markdown-direct-test.png');
});
