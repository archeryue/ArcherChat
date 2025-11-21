import { test } from '@playwright/test';

test('test setContent with simple content', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    console.log('CONSOLE:', text);
  });

  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  // Try to set simple content via window.__testEditor
  const result = await page.evaluate(() => {
    const editor = (window as any).__testEditor;
    if (!editor) {
      return { error: 'No editor found' };
    }

    // Get initial content
    const before = editor.getJSON();
    console.log('BEFORE setContent:', JSON.stringify(before));

    // Try setting very simple content
    const simpleContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Test Heading' }]
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Test paragraph' }]
        }
      ]
    };

    console.log('SETTING simple content...');
    editor.commands.setContent(simpleContent);

    // Check what we got
    const after = editor.getJSON();
    console.log('AFTER setContent:', JSON.stringify(after));

    return {
      before: before.content?.length,
      after: after.content?.length,
      afterFirstBlock: after.content?.[0]?.type,
      success: after.content?.length === 2 && after.content[0].type === 'heading'
    };
  });

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
});
