# End-to-End Testing with Playwright

This directory contains end-to-end tests for the OpenClaw Mission Control web application using Playwright.

## Quick Start

```bash
# Install dependencies (if not already installed)
npm install

# Install Playwright browsers (first time only)
npx playwright install chromium

# Run E2E tests
npm run test:e2e

# Run tests with UI mode (interactive)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Debug tests
npm run test:e2e:debug
```

## Test Structure

- `example.spec.ts` — Smoke tests to verify setup and basic app availability
- `auth.spec.ts` — Authentication flow tests (Clerk integration)
- `tasks.spec.ts` — Task management workflow tests (create, view, update, message)

## Configuration

Test configuration is in `playwright.config.ts`:
- **Base URL**: `http://localhost:3000` (configurable via `PLAYWRIGHT_BASE_URL`)
- **Browser**: Chromium only (lightweight for CI)
- **Retries**: 2 on CI, 0 locally
- **Reporter**: GitHub Actions format on CI, HTML locally
- **Artifacts**: Screenshots and videos on failure only

## Writing Tests

### Example Test

```typescript
import { test, expect } from '@playwright/test';

test('should display task board', async ({ page }) => {
  await page.goto('/test-account/tasks');
  await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible();
});
```

### Best Practices

1. **Use semantic selectors**: Prefer `getByRole`, `getByLabel`, `getByText` over CSS selectors
2. **Wait for assertions**: Playwright auto-waits; use `expect(locator).toBeVisible()` not manual waits
3. **Authenticate once**: Use `test.beforeEach()` for authentication setup
4. **Clean up test data**: Use `test.afterEach()` to delete created tasks/messages
5. **Skip tests that need credentials**: Mark as `test.skip()` until test user is configured

## Authentication Setup

Most tests require authentication. Options:

### Option 1: Clerk Test User (Recommended)
```typescript
test.beforeEach(async ({ page }) => {
  // Sign in with test credentials
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click();
});
```

### Option 2: Storage State (Faster)
```typescript
// playwright.config.ts
use: {
  storageState: 'playwright/.auth/user.json',
}

// auth.setup.ts
test('authenticate', async ({ page }) => {
  // Sign in once, save state
  await page.goto('/sign-in');
  // ... authentication steps
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
```

## CI Integration

E2E tests run automatically on CI via `.github/workflows/e2e.yml`:
- Triggered on PR to main/develop
- Runs in headless mode with retry
- Uploads test artifacts (screenshots, videos) on failure

## Test Data

**Current**: Tests use `.skip()` until test accounts are configured.

**Future**: Consider:
- Dedicated test account in Convex (`test-account`)
- Seeded test data (tasks, agents, documents)
- Cleanup scripts to reset test state

## Debugging

```bash
# Generate test report
npx playwright show-report

# Run single test file
npm run test:e2e -- auth.spec.ts

# Run single test
npm run test:e2e -- -g "should display sign-in page"

# Debug in VS Code
# Install Playwright extension, use debug config
```

## Common Issues

### Issue: Tests timeout waiting for dev server
**Solution**: Increase `webServer.timeout` in `playwright.config.ts`

### Issue: Authentication fails in CI
**Solution**: Ensure test credentials are set in CI environment variables

### Issue: Flaky tests
**Solution**: 
- Use `await expect(locator).toBeVisible()` (auto-retries)
- Avoid `page.waitForTimeout()` (use specific waits)
- Check for race conditions in test setup

## Resources

- [Playwright Docs](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Guide](https://playwright.dev/docs/debug)
