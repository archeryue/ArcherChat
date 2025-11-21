import { test, expect } from '@playwright/test';

test('test heading and list dropdown menus', async ({ page }) => {
  await page.goto('/whim-test');
  await page.waitForTimeout(3000);

  console.log('\n=== TESTING DROPDOWN MENUS ===\n');

  // Take initial screenshot
  await page.screenshot({ path: 'test-results/dropdown-initial.png', fullPage: true });
  console.log('Initial screenshot saved');

  // Find the heading button (has title="Heading")
  const headingButton = page.locator('button[title="Heading"]');
  await expect(headingButton).toBeVisible();
  console.log('✓ Heading button found');

  // Click the heading button
  await headingButton.click();
  await page.waitForTimeout(500);

  // Take screenshot after clicking
  await page.screenshot({ path: 'test-results/dropdown-heading-open.png', fullPage: true });
  console.log('Screenshot after clicking heading button saved');

  // Check if dropdown menu appears
  const headingMenu = page.locator('div.absolute.bottom-full').first();
  const isVisible = await headingMenu.isVisible().catch(() => false);

  if (isVisible) {
    console.log('✅ Heading dropdown is visible');

    // Get bounding box to check position
    const menuBox = await headingMenu.boundingBox();
    const buttonBox = await headingButton.boundingBox();

    if (menuBox && buttonBox) {
      console.log('Button position:', { x: buttonBox.x, y: buttonBox.y, width: buttonBox.width, height: buttonBox.height });
      console.log('Menu position:', { x: menuBox.x, y: menuBox.y, width: menuBox.width, height: menuBox.height });
      console.log('Menu is above button:', menuBox.y < buttonBox.y);
    }

    // Check menu items
    const textOption = page.locator('text=Text').first();
    const h1Option = page.locator('text=H1').first();
    const h2Option = page.locator('text=H2').first();
    const h3Option = page.locator('text=H3').first();

    console.log('Text option visible:', await textOption.isVisible());
    console.log('H1 option visible:', await h1Option.isVisible());
    console.log('H2 option visible:', await h2Option.isVisible());
    console.log('H3 option visible:', await h3Option.isVisible());
  } else {
    console.log('❌ Heading dropdown is NOT visible');
  }

  // Test list button
  console.log('\n--- Testing List Button ---\n');

  const listButton = page.locator('button[title="List"]');
  await expect(listButton).toBeVisible();
  console.log('✓ List button found');

  await listButton.click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'test-results/dropdown-list-open.png', fullPage: true });
  console.log('Screenshot after clicking list button saved');

  const listMenu = page.locator('div.absolute.bottom-full').last();
  const listVisible = await listMenu.isVisible().catch(() => false);

  if (listVisible) {
    console.log('✅ List dropdown is visible');

    const menuBox = await listMenu.boundingBox();
    const buttonBox = await listButton.boundingBox();

    if (menuBox && buttonBox) {
      console.log('Button position:', { x: buttonBox.x, y: buttonBox.y, width: buttonBox.width, height: buttonBox.height });
      console.log('Menu position:', { x: menuBox.x, y: menuBox.y, width: menuBox.width, height: menuBox.height });
      console.log('Menu is above button:', menuBox.y < buttonBox.y);
    }
  } else {
    console.log('❌ List dropdown is NOT visible');
  }

  console.log('\nTest complete - check screenshots in test-results/');
});
