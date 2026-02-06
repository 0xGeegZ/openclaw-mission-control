---
name: regression-testing
description: Automated regression test suites, snapshot testing, baseline comparisons, and CI/CD integration for preventing regressions
---

# Regression Testing

## Overview

Detect unintended changes in existing functionality through automated regression testing. This skill covers test automation strategies, snapshot testing, baseline comparisons, and CI/CD integration to catch regressions before production.

**Use this skill when:**
- Adding new features to prevent breaking existing behavior
- Refactoring code with confidence
- Testing UI changes (visual regressions)
- Verifying API responses remain unchanged
- Preventing performance regressions

**Cross-functional pairing:** @engineer **logging-observability** — Observability data helps validate test behavior and catch production regressions across deployments

---

## Regression Testing Strategies

### Strategy 1: Snapshot Testing

**What it does:** Captures expected output and detects changes

```typescript
// Example: UI component snapshot
import { render } from '@testing-library/react';
import { UserCard } from './UserCard';

test('user card renders correctly', () => {
  const { container } = render(
    <UserCard user={{ name: 'John', email: 'john@example.com' }} />
  );
  
  expect(container.firstChild).toMatchSnapshot();
});

// Generated snapshot (stored in __snapshots__/UserCard.test.ts.snap):
/*
exports[`user card renders correctly 1`] = `
<div>
  <h2>John</h2>
  <p>john@example.com</p>
</div>
`;
*/
```

### Strategy 2: API Response Baseline Testing

```typescript
// Capture API response and detect changes
import { apiClient } from './api';

test('GET /users/123 returns expected schema', async () => {
  const response = await apiClient.get('/users/123');
  
  expect(response).toMatchSnapshot();
});

// Expected baseline:
/*
{
  id: '123',
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: '2026-01-01T00:00:00Z',
  role: 'member'
}
*/
```

### Strategy 3: Regression Suite (Comprehensive)

```typescript
// Automated test suite to prevent regressions
describe('User Management Regression Suite', () => {
  test('create user creates with correct defaults', async () => {
    const user = await createUser({ name: 'Jane' });
    
    expect(user).toEqual({
      name: 'Jane',
      email: expect.any(String),
      createdAt: expect.any(Date),
      role: 'member',  // Default role
    });
  });

  test('update user preserves immutable fields', async () => {
    const user = await createUser({ name: 'Jane' });
    const original = { ...user };
    
    await updateUser(user.id, { name: 'Janet' });
    const updated = await getUser(user.id);
    
    expect(updated.createdAt).toEqual(original.createdAt);
    expect(updated.id).toEqual(original.id);
  });

  test('delete user removes from database', async () => {
    const user = await createUser({ name: 'Jane' });
    await deleteUser(user.id);
    
    const retrieved = await getUser(user.id);
    expect(retrieved).toBeNull();
  });
});
```

---

## Snapshot Testing Best Practices

### When to Use Snapshots

✅ **Good for:**
- UI components (structure, styling)
- API responses (structure, fields)
- Error messages
- Generated output

❌ **Avoid for:**
- Dynamic data (timestamps, IDs)
- Performance metrics
- Flaky assertions

### Handling Dynamic Data

```typescript
// ❌ Bad: Snapshots fail due to timestamp
test('user created with timestamp', () => {
  const user = createUser('John');
  expect(user).toMatchSnapshot();
  // Fails every time due to createdAt
});

// ✅ Good: Use property matchers
test('user created with timestamp', () => {
  const user = createUser('John');
  expect(user).toMatchSnapshot({
    createdAt: expect.any(String),
    id: expect.any(String),
  });
});
```

### Updating Snapshots

```bash
# Run tests with snapshot update flag
npm test -- -u

# Be careful: Review changes before committing
git diff __snapshots__/

# Good practice: Update one at a time
npm test -- -u UserCard.test.ts
```

---

## Baseline Comparison Testing

### Establishing Baselines

```typescript
// Baseline: Expected performance/behavior
const performanceBaseline = {
  responseTime: 200,      // ms
  memoryUsage: 50,        // MB
  errorRate: 0.001,       // 0.1%
};

test('API performance within baseline', async () => {
  const start = performance.now();
  const response = await apiClient.get('/users');
  const duration = performance.now() - start;
  
  expect(duration).toBeLessThan(performanceBaseline.responseTime);
  expect(response.statusCode).toBe(200);
});
```

### Detecting Regressions

```typescript
// Compare current metrics to baseline
test('memory usage not regressed', () => {
  const before = process.memoryUsage().heapUsed / 1024 / 1024;
  
  // Run operation
  processLargeDataset();
  
  const after = process.memoryUsage().heapUsed / 1024 / 1024;
  const increase = after - before;
  
  // Flag regression if memory usage increased significantly
  expect(increase).toBeLessThan(performanceBaseline.memoryUsage * 1.2);
});
```

---

## Visual Regression Testing

### Screenshot Comparison

```typescript
import { test, expect } from '@playwright/test';

test('button styling unchanged', async ({ page }) => {
  await page.goto('http://localhost:3000/button');
  
  const button = page.locator('button');
  
  // Capture and compare screenshot
  await expect(button).toHaveScreenshot('button.png');
});

// On failure, generates diff:
// ✗ button styling unchanged
//   Expected: button.png
//   Actual:   button.png (different)
//   Diff:     button.png.diff
```

### Handling Dynamic Changes

```typescript
// Ignore dynamic areas in screenshots
await expect(button).toHaveScreenshot({
  maxDiffPixels: 10,  // Allow small variations
  mask: [
    page.locator('.timestamp'),  // Ignore timestamp
    page.locator('.id'),          // Ignore ID
  ],
});
```

---

## CI/CD Integration

### GitHub Actions: Automated Regression Testing

```yaml
# .github/workflows/regression-tests.yml
name: Regression Tests

on:
  pull_request:
  push:
    branches: [master, develop]

jobs:
  regression:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - run: npm ci
      - run: npm run test:regression
      
      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: regression-results
          path: ./test-results/
      
      - name: Comment on PR with results
        if: always()
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('./test-results/summary.json', 'utf8'));
            
            const comment = `
            ## Regression Test Results
            - Passed: ${results.passed}
            - Failed: ${results.failed}
            - Skipped: ${results.skipped}
            `;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### Turbo Cache for Regression Tests

```json
{
  "pipeline": {
    "test:regression": {
      "outputs": ["coverage/**", "test-results/**"],
      "cache": true,
      "dependsOn": ["^build"]
    }
  }
}
```

---

## Snapshot Management

### Organizing Snapshots

```
src/
├── components/
│   ├── Button.tsx
│   ├── Button.test.ts
│   └── __snapshots__/
│       └── Button.test.ts.snap
└── utils/
    ├── format.ts
    ├── format.test.ts
    └── __snapshots__/
        └── format.test.ts.snap
```

### Reviewing Snapshot Changes

```bash
# Before committing snapshots:
git diff __snapshots__/

# Example output:
# - <h2>John Doe</h2>
# + <h2>Jane Doe</h2>

# Verify intentional changes
git add __snapshots__/
```

---

## Regression Testing Checklist

- [ ] Regression test suite defined for core flows
- [ ] Snapshots captured for UI/API responses
- [ ] Baseline metrics established (performance, memory)
- [ ] CI/CD automatically runs regression tests
- [ ] Developers trained on snapshot updates
- [ ] Screenshot tests for visual regressions (optional)
- [ ] Test results reported in PR comments
- [ ] Flaky tests identified and fixed
- [ ] Coverage maintained for regression tests
- [ ] Monthly review of regression metrics

---

## Common Pitfalls

| Pitfall | Risk | Solution |
|---------|------|----------|
| **Updating snapshots blindly** | Missing regressions | Review diffs carefully |
| **Too many snapshots** | Maintenance burden | Test behavior, not snapshots |
| **Ignoring flaky tests** | False confidence | Fix or skip unstable tests |
| **No CI integration** | Regressions reach prod | Automate in GitHub Actions |
| **Outdated baselines** | Detecting wrong regressions | Update baselines quarterly |

---

## Related Skills

- @test-coverage-analysis - Measure coverage in regression tests
- @mutation-testing - Validate regression tests catch actual bugs
- @contract-testing-openapi - Regression testing for API contracts
- @test-automation - CI/CD integration for regression suites
