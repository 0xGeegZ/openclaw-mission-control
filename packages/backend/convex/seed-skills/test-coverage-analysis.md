---
name: test-coverage-analysis
description: Code coverage metrics, untested paths, coverage targets, coverage-driven testing, and test gap identification
---

# Test Coverage Analysis

## Overview

Ensure comprehensive test coverage through metrics-driven analysis. This skill covers coverage measurement, gap identification, and strategies for achieving meaningful coverage targets that catch real bugs.

**Use this skill when:**
- Setting coverage targets for new features
- Identifying untested code paths
- Analyzing coverage gaps after implementation
- Planning test expansion for legacy code
- Validating coverage quality (not just metrics)

**Cross-functional pairing:** @engineer **database-optimization** — Database schema changes require coverage validation of new/modified query paths and edge cases

---

## Coverage Metrics Explained

### What Coverage Measures

```typescript
// Line Coverage: Did each line execute?
function calculateTotal(items: number[]) {
  const sum = items.reduce((a, b) => a + b, 0);     // Line 1
  const count = items.length;                        // Line 2
  if (count === 0) return 0;                         // Line 3
  return sum / count;                                // Line 4
}

// Test with [1, 2, 3] covers lines 1-4
// Test with [] covers lines 1-3 only
// Line 4 has 50% coverage
```

### Coverage Types (Pyramid)

```
           Branch Coverage (Condition combinations)
          /                                        \
         / Covers: if/else, switch, && || ternary \
        /                                          \
    Function Coverage (Entry/exit)
   /                                    \
  / Covers: function called or not       \
 /                                        \
Line Coverage (Instruction execution)
Covers: each statement executed or not
```

### Coverage Metrics

| Metric | Definition | Target | How to Improve |
|--------|-----------|--------|----------------|
| **Line** | % of lines executed | 80%+ | Write tests for uncovered lines |
| **Branch** | % of conditionals tested | 75%+ | Test both if/else, all cases |
| **Function** | % of functions called | 85%+ | Call all public functions |
| **Statement** | % of statements executed | 80%+ | Similar to line coverage |

---

## Coverage Tools

### Istanbul/NYC (Node.js)

```bash
npm install --save-dev nyc

# Generate coverage report
nyc npm test

# Output:
# ======= Coverage summary =======
# Statements   : 85.2% ( 210/246 )
# Branches     : 72.1% ( 95/131 )
# Functions    : 88.0% ( 22/25 )
# Lines        : 85.5% ( 211/247 )
```

**Config (`.nycrc.json`):**

```json
{
  "reporter": ["text", "text-summary", "html", "json"],
  "all": true,
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "dist/**"],
  "lines": 80,
  "branches": 75,
  "functions": 85,
  "statements": 80,
  "check-coverage": true
}
```

### Vitest Coverage

```bash
npm install --save-dev @vitest/coverage-v8

# Run tests with coverage
vitest --coverage

# Output:
# src/utils.ts         92.3% | 12/13
# src/api.ts           78.5% | 42/54
```

**Config (`vitest.config.ts`):**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
  },
});
```

---

## Gap Identification Strategy

### Step 1: Run Coverage Report

```bash
npm run coverage 2>&1 | grep -E "^packages/|Lines|Branches"
```

### Step 2: Find Uncovered Lines

```html
<!-- coverage/index.html -->
<!-- Color coded:
     Green = Covered
     Red = Uncovered
     Yellow = Partially covered
-->
```

### Step 3: Analyze Gaps by Type

**Uncovered conditionals:**

```typescript
// Missing: test when count === 0
function divide(a: number, b: number) {
  if (b === 0) return null;  // ← Not tested
  return a / b;
}
```

**Uncovered error paths:**

```typescript
// Missing: test when userId is invalid
async function getUser(userId: string) {
  if (!userId) throw new Error('Invalid user');  // ← Not tested
  return db.get(userId);
}
```

**Uncovered branches:**

```typescript
// Missing: test success branch
try {
  await api.call();  // ← Not tested when it succeeds
} catch (e) {
  logger.error(e);   // ← Tested
}
```

---

## Coverage-Driven Testing

### Approach: Minimum Viable Coverage

```typescript
// ❌ Don't test every line—test behavior

// ❌ Bad: 100% line coverage but poor tests
test('adds 1 + 1', () => {
  expect(1 + 1).toBe(2);  // Trivial
});

test('adds 2 + 2', () => {
  expect(2 + 2).toBe(4);  // Trivial
});

// ✅ Good: Meaningful coverage

test('add function', () => {
  expect(add(1, 1)).toBe(2);
  expect(add(-1, 1)).toBe(0);
  expect(add(0, 0)).toBe(0);
});
```

### Approach: Risk-Based Coverage

**High-risk code → Higher coverage:**

```typescript
// Critical: Payment processing (aim for 95%+)
function processPayment(amount: number, card: Card) {
  if (amount < 0) throw new Error('Invalid amount');
  if (!card.isValid()) throw new Error('Invalid card');
  return chargeCard(card, amount);
}

// Medium-risk: Logging (aim for 70%+)
function log(level: string, msg: string) {
  if (process.env.NODE_ENV === 'test') return;
  console.log(`[${level}] ${msg}`);
}

// Low-risk: UI helpers (aim for 60%+)
function formatDate(date: Date) {
  return date.toLocaleDateString();
}
```

---

## Setting Coverage Targets

### Industry Standards

| Industry | Typical Target |
|----------|----------------|
| **Financial** | 90%+ (high risk) |
| **Healthcare** | 85%+ (regulated) |
| **SaaS** | 75-80% (balanced) |
| **Startups** | 60-70% (speed priority) |

### OpenClaw Targets

**Recommended for Phase 2:**

```json
{
  "lines": 80,
  "functions": 85,
  "branches": 75,
  "statements": 80
}
```

**Tier-based approach:**

```typescript
// Tier 1 (Core): 90% coverage
// - Authentication, payment, data access

// Tier 2 (Features): 75% coverage
// - Business logic, API endpoints

// Tier 3 (UI/Utils): 60% coverage
// - UI components, helpers
```

---

## Improving Coverage

### Pattern 1: Path Coverage

```typescript
// Original: 50% branch coverage
function validate(input: string) {
  if (!input) return false;
  if (input.length < 3) return false;
  return true;
}

// Test cases needed for 100% branch coverage:
test('rejects empty', () => expect(validate('')).toBe(false));
test('rejects short', () => expect(validate('ab')).toBe(false));
test('accepts valid', () => expect(validate('abc')).toBe(true));
```

### Pattern 2: Error Path Coverage

```typescript
// Original: Missing error tests
async function fetchUser(id: string) {
  const user = await db.get(id);
  return user;
}

// Add error scenarios:
test('handles not found', async () => {
  db.get = jest.fn().mockRejectedValue(new Error('Not found'));
  await expect(fetchUser('invalid')).rejects.toThrow('Not found');
});

test('handles network error', async () => {
  db.get = jest.fn().mockRejectedValue(new Error('Network'));
  await expect(fetchUser('123')).rejects.toThrow('Network');
});
```

### Pattern 3: Boundary Coverage

```typescript
// Original: 50% coverage
function isAdult(age: number) {
  return age >= 18;
}

// Add boundary tests:
test('boundary: age 17 is not adult', () => {
  expect(isAdult(17)).toBe(false);
});

test('boundary: age 18 is adult', () => {
  expect(isAdult(18)).toBe(true);
});

test('extreme: age 150', () => {
  expect(isAdult(150)).toBe(true);
});

test('invalid: negative age', () => {
  expect(isAdult(-1)).toBe(false);
});
```

---

## Coverage Thresholds in CI/CD

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test & Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - run: npm ci
      - run: npm run coverage
      
      - name: Check coverage
        run: |
          if [ $(cat coverage/coverage-summary.json | jq '.total.lines.pct') -lt 80 ]; then
            echo "Coverage below 80%"
            exit 1
          fi
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Enforce Thresholds

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      lines: 80,
      branches: 75,
      functions: 85,
      statements: 80,
      perFile: true,  // Per-file threshold
    },
  },
});
```

---

## Common Coverage Pitfalls

| Pitfall | Risk | Solution |
|---------|------|----------|
| **High coverage, low quality** | False confidence | Test behavior, not lines |
| **Testing implementation** | Tests break with refactors | Test contracts, not internals |
| **Skipping error paths** | Missing bug detection | Mock failures and timeouts |
| **Unrealistic targets** | Team burnout | Set risk-based targets |
| **Ignoring branches** | 80% line ≠ 80% branch | Explicitly test conditions |

---

## Coverage Checklist

- [ ] Coverage tool integrated (Istanbul/Vitest)
- [ ] Coverage targets set for project (lines, branches, functions)
- [ ] CI/CD enforces thresholds
- [ ] Coverage reports accessible (Codecov, GitHub)
- [ ] Team aligned on quality over quantity
- [ ] High-risk code prioritized (auth, payments)
- [ ] Error paths tested
- [ ] Boundary cases tested
- [ ] Coverage gaps documented
- [ ] Monthly review of coverage trends

---

## Related Skills

- @regression-testing - Automated regression suites to maintain coverage
- @database-optimization - Coverage validation for schema changes
- @mutation-testing - Validate that tests actually catch bugs
- @test-automation - Integrate coverage into CI/CD pipelines
