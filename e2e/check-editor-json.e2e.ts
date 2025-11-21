import { test } from '@playwright/test';

test('check editor JSON content', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);
  
  // Get the editor's actual JSON content
  const editorJSON = await page.evaluate(() => {
    const editorElement = document.querySelector('.ProseMirror');
    if (!editorElement) return null;
    
    // Try to access the editor instance
    return {
      innerHTML: editorElement.innerHTML.substring(0, 500),
      textContent: editorElement.textContent,
      childCount: editorElement.children.length,
    };
  });
  
  console.log('Editor HTML:', editorJSON);
});
