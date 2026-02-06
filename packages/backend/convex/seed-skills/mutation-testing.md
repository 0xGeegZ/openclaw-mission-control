---
name: mutation-testing
description: Mutation testing with Stryker, test quality validation, identifying weak tests, and ensuring tests catch real bugs
---

# Mutation Testing

## Overview

Validate test quality by introducing intentional bugs (mutations) and checking if tests catch them. This skill covers mutation testing tools, mutation operators, test effectiveness measurement, and improving test suites based on mutation results.

**Use this skill when:**
- Evaluating test suite quality
- Identifying weak/missing test cases
- Ensuring tests catch actual bugs
- Improving test effectiveness
- Validating coverage quality (not just metrics)

**Cross-functional pairing:** @engineer **doc-generation** — Well-documented code clarifies intent and edge cases, making it easier to write comprehensive mutation tests

---

## What is Mutation Testing?

### The Concept

```
Original Code:
  function add(a, b) { return a + b; }

Mutation 1 (Arithmetic):
  function add(a, b) { return a - b; }  // Changed + to -

Mutation 2 (Return Value):
  function add(a, b) { return a; }      // Removed + b

Test Result:
  ✓ Test: add(1, 2) === 3              // Catches both mutations
  ✓ Mutation 1 kills: -1 ≠ 3
  ✓ Mutation 2 kills: 1 ≠ 3
```

### Key Metrics

| Metric | Definition | Interpretation |
|--------|-----------|-----------------|
| **Killed Mutations** | Tests caught the bug | ✓ Good test |
| **Survived Mutations** | Tests missed the bug | ✗ Weak test |
| **Mutation Score** | % of mutations killed | Higher = better tests |

---

## Stryker Installation & Setup

### Installation

```bash
npm install --save-dev @stryker-mutator/core \
  @stryker-mutator/typescript-checker \
  @stryker-mutator/jest-runner
```

### Configuration

```javascript
// stryker.config.mjs
export default {
  _comment: 'Mutation testing configuration',
  
  // Files to mutate
  mutate: ['src/**/*.ts', '!src/**/*.test.ts'],
  
  // Test configuration
  testRunner: 'jest',
  jest: {
    config: require('./jest.config.js'),
  },
  
  // Reporters
  reporters: ['html', 'json', 'dashboard'],
  htmlReporter: {
    baseDir: 'reports/mutation',
  },
  
  // Performance
  concurrency: 4,
  timeoutMS: 5000,
  
  // Mutation score threshold
  thresholds: {
    high: 80,    // Green: 80%+
    medium: 60,  // Yellow: 60-79%
    low: 40,     // Red: <60%
  },
};
```

### Run Mutations

```bash
# Run mutation tests
npm run stryker

# Output:
# ✓ 145 killed
# ✗ 23 survived
# ⊘ 5 no coverage
# Score: 86.3%
```

---

## Mutation Operators

### Arithmetic Operators

```typescript
// Original code
function multiply(a: number, b: number) {
  return a * b;
}

// Possible mutations
// a * b  →  a + b   (Arithmetic)
// a * b  →  a - b   (Arithmetic)
// a * b  →  a / b   (Arithmetic)
// a * b  →  a % b   (Arithmetic)

test('multiply(3, 4) equals 12', () => {
  expect(multiply(3, 4)).toBe(12);  // Kills all mutations ✓
});

test('multiply(2, 0) equals 0', () => {
  expect(multiply(2, 0)).toBe(0);   // Kills a - b mutation ✓
});
```

### Logical Operators

```typescript
// Original code
function isAdult(age: number) {
  return age >= 18;
}

// Possible mutations
// age >= 18  →  age > 18    (Boundary)
// age >= 18  →  age <= 18   (Logical)
// age >= 18  →  age < 18    (Logical)

test('age 18 is adult', () => {
  expect(isAdult(18)).toBe(true);   // Kills age > 18 mutation
});

test('age 17 is not adult', () => {
  expect(isAdult(17)).toBe(false);  // Kills age <= 18 mutation
});

test('age 100 is adult', () => {
  expect(isAdult(100)).toBe(true);  // Redundant, doesn't kill new mutations
});
```

### Conditional Mutations

```typescript
// Original code
function validate(input: string) {
  if (!input) return false;
  if (input.length < 3) return false;
  return true;
}

// Possible mutations
// if (!input)           →  if (input)        (Negate)
// if (input.length < 3) →  if (input.length > 3) (Invert)
// input.length < 3      →  input.length <= 3 (Boundary)
// return true           →  return false     (Return value)

test('empty string fails validation', () => {
  expect(validate('')).toBe(false);        // Kills: if (input)
});

test('short string fails validation', () => {
  expect(validate('ab')).toBe(false);      // Kills: input.length > 3
});

test('three character string passes', () => {
  expect(validate('abc')).toBe(true);      // Kills: return false
});

test('four character string passes', () => {
  expect(validate('abcd')).toBe(true);     // Redundant
});
```

---

## Interpreting Mutation Results

### Mutation Report

```html
<!-- reports/mutation/index.html -->

File: src/utils.ts
├─ Function: add
│  ├─ add(1, 1)  ✓ 3 killed / 3 mutations
│  └─ Score: 100%
│
├─ Function: divide
│  ├─ divide(10, 2)  ✓ 2 killed / 2 mutations
│  ├─ divide(0, 0)   ✗ 1 survived / 3 mutations
│  └─ Score: 66.7%
│
└─ Function: validate
   ├─ validate('')        ✓ 1 killed
   ├─ validate('short')   ✗ 1 survived
   └─ Score: 50%
```

### Analyzing Survived Mutations

```typescript
// Original code
function divide(a: number, b: number) {
  if (b === 0) return 0;
  return a / b;
}

// Mutation: b === 0  →  b === 1 (SURVIVED)
// Test doesn't catch this because we only test b === 0

// Fix: Add test for non-zero divisor
test('divide with zero divisor returns 0', () => {
  expect(divide(10, 0)).toBe(0);  // Catches b === 0 mutation
});

test('divide 10 by 2 equals 5', () => {
  expect(divide(10, 2)).toBe(5);  // Now catches b === 1 mutation ✓
});
```

---

## Improving Test Quality with Mutations

### Pattern 1: Boundary Testing

```typescript
// Weak test: Only happy path
test('age validation', () => {
  expect(isAdult(25)).toBe(true);  // Mutation: 25 ≥ 18 → 25 > 18 (SURVIVES)
});

// Strong test: Boundary cases
test('age 18 is minimum adult age', () => {
  expect(isAdult(18)).toBe(true);  // Catches 25 ≥ 18 → 25 > 18
});

test('age 17 is not adult', () => {
  expect(isAdult(17)).toBe(false); // Catches 25 ≥ 18 → 25 ≤ 18
});
```

### Pattern 2: Error Path Testing

```typescript
// Weak test: Only success path
async function fetchUser(id: string) {
  return await db.get(id);  // Mutation: await removed (SURVIVES if not tested)
}

test('fetch user by id', async () => {
  const user = await fetchUser('123');
  expect(user.name).toBe('John');  // Doesn't catch missing await
});

// Strong test: Include error scenarios
test('fetch user handles not found', async () => {
  db.get = jest.fn().mockRejectedValue(new Error('Not found'));
  
  await expect(fetchUser('invalid')).rejects.toThrow();
  // Catches mutations in error handling
});
```

### Pattern 3: Type Safety

```typescript
// Weak test: No type checking
function greet(name: string) {
  return `Hello, ${name}!`;
}

test('greet works', () => {
  expect(greet('John')).toContain('Hello');  // Mutation: `Hello` → `Goodbye` (SURVIVES)
});

// Strong test: Exact assertion
test('greet returns correct greeting', () => {
  expect(greet('John')).toBe('Hello, John!');  // Catches greeting mutation
});
```

---

## Incremental Mutation Testing

### CI/CD Integration

```yaml
# .github/workflows/mutation.yml
name: Mutation Tests

on:
  pull_request:
  push:
    branches: [master, develop]

jobs:
  mutation:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - run: npm ci
      
      - name: Run mutation tests
        run: npm run stryker
        continue-on-error: true
      
      - name: Check mutation score
        run: |
          SCORE=$(cat reports/mutation/mutation-score.txt)
          if (( $(echo "$SCORE < 70" | bc -l) )); then
            echo "Mutation score below 70%: $SCORE%"
            exit 1
          fi
      
      - name: Upload mutation report
        uses: actions/upload-artifact@v3
        with:
          name: mutation-report
          path: reports/mutation/
```

### Baseline Tracking

```bash
# Store baseline mutation score
npm run stryker > mutation-baseline.txt

# Check improvement
npm run stryker > mutation-current.txt
BASELINE=$(grep "Score:" mutation-baseline.txt | grep -oP '\d+\.\d+')
CURRENT=$(grep "Score:" mutation-current.txt | grep -oP '\d+\.\d+')

echo "Baseline: $BASELINE%"
echo "Current: $CURRENT%"
echo "Improvement: $(echo "$CURRENT - $BASELINE" | bc)%"
```

---

## Mutation Testing Best Practices

### Do's

✅ **Run regularly** — Part of CI/CD pipeline  
✅ **Focus on critical code** — Start with high-risk functions  
✅ **Analyze survived mutations** — Understand test gaps  
✅ **Improve iteratively** — Fix a few weak tests per sprint  
✅ **Track trends** — Monitor mutation score over time

### Don'ts

❌ **Aim for 100%** — Diminishing returns above 80%  
❌ **Mutate everything** — Focus on critical paths first  
❌ **Ignore survived mutations** — They reveal real bugs  
❌ **Write mutations for mutations** — Test behavior, not metrics  
❌ **Block on first run** — Establish baseline gradually

---

## Mutation Score Interpretation

| Score | Interpretation | Action |
|-------|----------------|--------|
| 80%+ | Excellent tests | Maintain quality |
| 70-79% | Good tests | Address weak spots |
| 60-69% | Acceptable tests | Plan improvements |
| <60% | Poor tests | Significant work needed |

---

## Common Pitfalls

| Pitfall | Risk | Solution |
|---------|------|----------|
| **Over-testing** | Slow tests, maintenance burden | Test behavior, not implementation |
| **Weak assertions** | Mutations survive | Use exact assertions (`toBe` vs `toBeDefined`) |
| **Missing edge cases** | Boundary mutations survive | Test boundaries explicitly |
| **Flaky tests** | Mutation results unreliable | Fix flaky tests before mutation testing |
| **No baseline** | Can't track progress | Establish baseline first sprint |

---

## Mutation Testing Checklist

- [ ] Stryker installed and configured
- [ ] Baseline mutation score established
- [ ] CI/CD runs mutation tests
- [ ] Mutation score threshold set (70%+)
- [ ] Team trained on interpreting results
- [ ] Survived mutations analyzed weekly
- [ ] Test improvements tracked
- [ ] Critical code paths prioritized
- [ ] Mutation reports accessible
- [ ] Trends monitored (trending up?)

---

## Related Skills

- @test-coverage-analysis - Coverage metrics vs. mutation quality
- @doc-generation - Documentation clarifies edge cases for tests
- @regression-testing - Regression tests should have high mutation score
- @test-automation - Mutation tests run in CI/CD pipeline
