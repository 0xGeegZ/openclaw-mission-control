import { test, expect } from "@playwright/test";

/**
 * E2E Tests: Example / Smoke Tests
 *
 * Basic smoke tests to verify Playwright setup and app availability.
 */

test.describe("Smoke Tests", () => {
  test("should load the homepage", async ({ page }) => {
    await page.goto("/");

    // Verify page loads without errors
    await expect(page).not.toHaveTitle(/error/i);
  });

  test("should have valid HTML structure", async ({ page }) => {
    await page.goto("/");

    // Verify basic HTML structure
    const html = await page.locator("html").first();
    await expect(html).toBeVisible();
  });

  test("should not have console errors on homepage", async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/", { waitUntil: "load" });
    // Wait for app shell; avoid networkidle (unreliable with WebSockets/long-lived connections)
    await page
      .locator("#main-content")
      .waitFor({ state: "visible", timeout: 15000 });

    // Allow Clerk/Convex initialization warnings but no hard errors
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes("Clerk") && !err.includes("Convex"),
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
