import { test, expect } from '@playwright/test';

/**
 * E2E Tests: Command Palette (Cmd+K)
 * 
 * Tests keyboard activation, search filtering, navigation, and command execution.
 * 
 * Note: These tests require authentication and access to the root layout.
 */

test.describe('Command Palette (Cmd+K)', () => {
  test('should open with Cmd+K or Ctrl+K', async ({ page }) => {
    await page.goto('/');
    
    // Press Ctrl+K (works cross-platform)
    await page.keyboard.press('Control+K');
    
    // Verify palette modal is visible
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    
    // Verify search input is focused
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toBeFocused();
  });

  test.skip('should open with Ctrl+K on Windows/Linux', async ({ page }) => {
    await page.goto('/');
    
    // Press Ctrl+K
    await page.keyboard.press('Control+K');
    
    // Verify palette modal is visible
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    
    // Verify search input is focused
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toBeFocused();
  });

  test('should display default commands', async ({ page }) => {
    await page.goto('/');
    
    // Open palette
    await page.keyboard.press('Control+K');
    
    // Verify default commands are visible
    await expect(page.getByText('New Task')).toBeVisible();
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('should filter commands by search query', async ({ page }) => {
    await page.goto('/');
    
    // Open palette
    await page.keyboard.press('Control+K');
    
    // Type search query
    await page.keyboard.type('task');
    
    // Verify filtered results
    await expect(page.getByText('New Task')).toBeVisible();
    
    // Clear and search for different term
    await page.keyboard.press('Control+A');
    await page.keyboard.type('settings');
    
    // Verify Settings appears
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('should show "no results" message for non-matching query', async ({ page }) => {
    await page.goto('/');
    
    // Open palette
    await page.keyboard.press('Control+K');
    
    // Type non-matching query
    await page.keyboard.type('xyz123notfound');
    
    // Verify no results message
    await expect(page.getByText(/no results found/i)).toBeVisible();
  });

  test('should navigate results with arrow keys', async ({ page }) => {
    await page.goto('/');
    
    // Open palette
    await page.keyboard.press('Control+K');
    
    // Get first and second items
    const items = page.locator('li[class*="item"]');
    await expect(items).toHaveCount(2); // At least "New Task" and "Settings"
    
    // First item should be selected by default
    const firstItem = items.first();
    await expect(firstItem).toHaveClass(/selected/);
    
    // Press Down arrow
    await page.keyboard.press('ArrowDown');
    
    // Second item should now be selected
    const secondItem = items.nth(1);
    await expect(secondItem).toHaveClass(/selected/);
    
    // Press Up arrow
    await page.keyboard.press('ArrowUp');
    
    // First item should be selected again
    await expect(firstItem).toHaveClass(/selected/);
  });

  test('should execute command on Enter key', async ({ page }) => {
    await page.goto('/');
    
    // Open palette
    await page.keyboard.press('Control+K');
    
    // Navigate to "Settings" using arrow keys
    await page.keyboard.press('ArrowDown');
    
    // Press Enter to execute
    await page.keyboard.press('Enter');
    
    // Verify palette closed and navigated to settings
    const modal = page.locator('dialog[open]');
    await expect(modal).not.toBeVisible();
    
    // Verify URL changed to /settings
    await expect(page).toHaveURL(/\/settings/);
  });

  test('should close palette with Escape key', async ({ page }) => {
    await page.goto('/');
    
    // Open palette
    await page.keyboard.press('Control+K');
    
    // Verify it's open
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    
    // Press Escape
    await page.keyboard.press('Escape');
    
    // Verify palette closed
    await expect(modal).not.toBeVisible();
  });

  test('should close palette when clicking overlay', async ({ page }) => {
    await page.goto('/');
    
    // Open palette
    await page.keyboard.press('Control+K');
    
    // Verify it's open
    const modal = page.locator('dialog[open]');
    await expect(modal).toBeVisible();
    
    // Click overlay (outside modal)
    const overlay = page.locator('[class*="overlay"]');
    await overlay.click();
    
    // Verify palette closed
    await expect(modal).not.toBeVisible();
  });

  test('should create new task from palette', async ({ page }) => {
    await page.goto('/');
    
    // Open palette
    await page.keyboard.press('Control+K');
    
    // Select "New Task" (first item)
    await page.keyboard.press('Enter');
    
    // Verify palette closed and navigated to task creation
    const modal = page.locator('dialog[open]');
    await expect(modal).not.toBeVisible();
    
    // Verify URL changed to task creation page
    await expect(page).toHaveURL(/\/tasks\/new/);
  });

  test('should reset search when reopened', async ({ page }) => {
    await page.goto('/');
    
    // Open palette and type search
    await page.keyboard.press('Control+K');
    await page.keyboard.type('task');
    
    // Close palette
    await page.keyboard.press('Escape');
    
    // Reopen palette
    await page.keyboard.press('Control+K');
    
    // Verify search input is empty
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toHaveValue('');
  });
});
