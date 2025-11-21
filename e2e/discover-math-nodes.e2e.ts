import { test } from '@playwright/test';

test('discover math node type names', async ({ page }) => {
  const capturedJSON: any[] = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.startsWith('EDITOR_JSON:')) {
      try {
        const json = JSON.parse(text.replace('EDITOR_JSON:', ''));
        capturedJSON.push(json);
        console.log('Captured JSON:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('Failed to parse:', text);
      }
    }
  });

  await page.goto('/whim-test');
  await page.waitForTimeout(2000);

  // Clear editor first
  await page.evaluate(() => {
    const editorElement = document.querySelector('.ProseMirror');
    if (editorElement) {
      editorElement.innerHTML = '';
    }
  });

  // Insert inline math
  console.log('\n=== INSERTING INLINE MATH ===');
  page.once('dialog', async (dialog) => {
    await dialog.accept('E = mc^2');
  });

  const inlineMathButton = page.locator('button[title*="Math Formula (Inline)"]');
  await inlineMathButton.click();
  await page.waitForTimeout(500);

  // Capture inline math JSON
  await page.evaluate(() => {
    const win = window as any;
    if (win.__testEditor) {
      const json = win.__testEditor.getJSON();
      console.log('EDITOR_JSON:' + JSON.stringify(json));
    }
  });

  await page.waitForTimeout(500);

  // Insert block math
  console.log('\n=== INSERTING BLOCK MATH ===');
  page.once('dialog', async (dialog) => {
    await dialog.accept('\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}');
  });

  const blockMathButton = page.locator('button[title*="Math Formula (Block)"]');
  await blockMathButton.click();
  await page.waitForTimeout(500);

  // Capture block math JSON
  await page.evaluate(() => {
    const win = window as any;
    if (win.__testEditor) {
      const json = win.__testEditor.getJSON();
      console.log('EDITOR_JSON:' + JSON.stringify(json));
    }
  });

  await page.waitForTimeout(1000);

  console.log('\n=== FINAL CAPTURED JSON ===');
  console.log(JSON.stringify(capturedJSON, null, 2));
});
