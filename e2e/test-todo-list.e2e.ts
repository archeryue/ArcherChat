import { test, expect } from '@playwright/test';

test('test todo list rendering and functionality', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  console.log('\n=== TESTING TODO LIST ===\n');

  // Find the todo list button
  const todoButton = page.locator('button[title="Todo List"]');
  await expect(todoButton).toBeVisible();
  console.log('✓ Todo list button found');

  // Click the editor first to focus it and type some text
  await page.locator('.ProseMirror').click();
  await page.waitForTimeout(300);

  console.log('Typing text first...');
  await page.keyboard.type('First todo item');
  await page.waitForTimeout(500);

  console.log('Selecting all text...');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);

  // Now click the todo list button to convert the text to a task list
  console.log('Clicking todo list button...');
  await todoButton.click();
  await page.waitForTimeout(500);

  console.log('Clicked todo list button');

  // Check if a task list was created
  const taskList = page.locator('ul[data-type="taskList"]');
  const taskListExists = await taskList.count() > 0;

  if (taskListExists) {
    console.log('✅ Task list created');

    // Take screenshot immediately after task list creation
    await page.screenshot({ path: 'test-results/todo-list-created.png', fullPage: true });
    console.log('Screenshot saved: test-results/todo-list-created.png');

    // Get the HTML content of the task list
    const taskListHTML = await taskList.innerHTML();
    console.log('Task list HTML:', taskListHTML);

    // Get the first task item - use li[data-checked] which is what TipTap actually generates
    const taskItem = page.locator('ul[data-type="taskList"] > li[data-checked]').first();
    const taskItemExists = await taskItem.count() > 0;

    if (taskItemExists) {
      console.log('✅ Task item found');

      // Take screenshot of the task list
      await page.screenshot({ path: 'test-results/todo-list-initial.png', fullPage: true });
      console.log('Screenshot saved: test-results/todo-list-initial.png');

      // Check the structure of the task item
      const checkbox = taskItem.locator('input[type="checkbox"]');
      const checkboxExists = await checkbox.count() > 0;
      console.log(`Checkbox exists: ${checkboxExists}`);

      if (checkboxExists) {
        const checkboxBox = await checkbox.boundingBox();
        console.log('Checkbox position:', checkboxBox);
      }

      // Get the text content
      const textContent = await taskItem.textContent();
      console.log('Task item text content:', textContent);

      // Check for bullet/list marker
      const computedStyle = await taskItem.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          listStyleType: styles.listStyleType,
          listStylePosition: styles.listStylePosition,
          display: styles.display,
          pseudoBefore: window.getComputedStyle(el, '::before').content,
        };
      });
      console.log('Task item styles:', computedStyle);

      // Check if there's a dot/bullet marker
      if (computedStyle.listStyleType !== 'none') {
        console.log('❌ PROBLEM 1: List style type is not "none", there may be a dot/bullet');
        console.log('   List style type:', computedStyle.listStyleType);
      } else {
        console.log('✅ No list style marker (dot)');
      }

      // Type some text into the task item
      await taskItem.click();
      await page.keyboard.type('Test todo item');
      await page.waitForTimeout(500);

      // Take screenshot after typing
      await page.screenshot({ path: 'test-results/todo-list-with-text.png', fullPage: true });
      console.log('Screenshot saved: test-results/todo-list-with-text.png');

      // Check if checkbox and text are on the same line
      const taskItemBox = await taskItem.boundingBox();
      const checkboxBox2 = await checkbox.boundingBox();

      if (taskItemBox && checkboxBox2) {
        const taskItemHeight = taskItemBox.height;
        console.log('Task item height:', taskItemHeight);
        console.log('Checkbox height:', checkboxBox2.height);

        // If the task item height is significantly larger than the checkbox height,
        // it might indicate text is on a new line
        if (taskItemHeight > checkboxBox2.height * 2) {
          console.log('❌ PROBLEM 2: Task item height suggests text might be on new line');
          console.log('   Task item is more than 2x checkbox height');
        } else {
          console.log('✅ Checkbox and text appear to be on the same line');
        }
      }

      // Try clicking the checkbox
      await checkbox.click();
      await page.waitForTimeout(500);

      const isChecked = await checkbox.isChecked();
      console.log('Checkbox checked after click:', isChecked);

      await page.screenshot({ path: 'test-results/todo-list-checked.png', fullPage: true });
      console.log('Screenshot saved: test-results/todo-list-checked.png');
    } else {
      console.log('❌ No task items found');
    }
  } else {
    console.log('❌ No task list created');
  }

  console.log('\nTest complete - check screenshots in test-results/');
});
