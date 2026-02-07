import { test, expect } from "@playwright/test";

/**
 * E2E Tests: Authentication Flow
 *
 * Tests user authentication via Clerk integration.
 */

test.describe("Authentication", () => {
  test("should display sign-in page for unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/");
    // App shows landing at / for unauthenticated users; sign-in is available via link
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("link", { name: /log in|sign in/i }),
    ).toBeVisible();
  });

  test.skip("should allow user to sign in with email", async ({ page }) => {
    // Skip by default - requires test user credentials
    // Manual test: verify sign-in flow works with valid credentials
    await page.goto("/");
    // Add sign-in steps here when test credentials are available
  });

  test.skip("should persist authentication across page reloads", async ({
    page: _page,
    context: _context,
  }) => {
    // Skip by default - requires authenticated session
    // Manual test: sign in, reload page, verify still authenticated
  });
});
