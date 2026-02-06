# async-concurrency-patterns

**Tier:** MEDIUM (Phase 3)  
**Author:** Engineer (Full-Stack)  
**Category:** Async/Concurrency & Performance  
**Status:** Operational  

## Overview
Advanced async/concurrency patterns skill enabling safe Promise handling, race condition prevention, deadlock avoidance, and robust error handling in JavaScript/TypeScript asynchronous code. Critical for production reliability and performance optimization.

## Core Competencies

### 1. Promise Handling
- Promise creation and resolution/rejection patterns
- `.then()`, `.catch()`, `.finally()` semantics
- Async/await syntax and control flow
- Promise chaining vs. composition
- Promise.all(), Promise.race(), Promise.allSettled()
- Promise.any() and iterator patterns
- Microtask queue behavior
- Exception propagation in Promise chains

### 2. Race Conditions
- Identifying race condition vulnerabilities
- State mutation in concurrent contexts
- Resource locking mechanisms
- Atomic operations implementation
- Pessimistic vs. optimistic concurrency control
- CAS (Compare-And-Swap) patterns
- Version-based conflict detection
- Database transaction isolation levels

### 3. Deadlock Prevention
- Circular dependency detection
- Lock ordering enforcement
- Timeout mechanisms
- Resource allocation strategies
- Wait-for graph analysis
- Avoidance vs. detection approaches
- Single-threaded JavaScript event loop understanding
- Promise queue management

### 4. Async Error Handling
- Try/catch in async functions
- Error propagation in Promise chains
- Unhandled rejection prevention
- Error context preservation
- Graceful degradation strategies
- Retry logic with exponential backoff
- Error recovery patterns
- Logging and observability for async errors

## Implementation Patterns

### Safe Promise Composition
```javascript
// Parallel execution with error isolation
Promise.allSettled([
  asyncTask1(),
  asyncTask2(),
  asyncTask3()
]).then(results => {
  // Handle both fulfilled and rejected promises
});

// Sequential execution with error handling
async function safeSequence() {
  try {
    const result1 = await asyncTask1();
    const result2 = await asyncTask2(result1);
    return await asyncTask3(result2);
  } catch (error) {
    // Handle and recover
  }
}
```

### Race Condition Prevention
```javascript
// Using locks for critical sections
const lock = new AsyncLock();
let sharedState = 0;

async function criticalSection() {
  return lock.acquire('key', async () => {
    // Atomic read-modify-write
    const value = sharedState;
    // ... computation ...
    sharedState = value + 1;
  });
}
```

### Deadlock Prevention
```javascript
// Ordered resource acquisition
async function orderedAcquisition() {
  const lock1 = await acquireLock('resourceA');
  const lock2 = await acquireLock('resourceB');
  
  try {
    // Use both resources
  } finally {
    // Release in reverse order
    await lock2.release();
    await lock1.release();
  }
}

// Timeout protection
const withTimeout = (promise, ms) => 
  Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), ms)
    )
  ]);
```

### Error Handling with Retry
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

## Cross-Functional Validation Points

**@qa Validation:**
- Concurrency test coverage (race conditions)
- Deadlock detection under load
- Error handling completeness
- Promise chain correctness
- Timeout boundary conditions
- Memory leak prevention in async contexts
- Event loop blocking detection

**Test Coverage:**
- Unit: Individual Promise patterns, error scenarios
- Integration: Multi-async component interaction
- Concurrency: Load testing with race condition injection
- E2E: Real-world concurrent workflows

## CLI Tools & Debugging

```bash
# Detect unhandled promise rejections
node --unhandled-rejections=strict app.js

# Profile async performance
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# Debug race conditions
node --expose-gc --inspect app.js
# Use Chrome DevTools for Timeline analysis
```

## JavaScript/TypeScript Async APIs

### Promise APIs
- `Promise.all()` - Wait for all, fail on first error
- `Promise.allSettled()` - Wait for all, include results
- `Promise.race()` - Return first settled promise
- `Promise.any()` - Return first fulfilled promise
- `Promise.resolve()` / `Promise.reject()`

### Async/Await
- Syntactic sugar for Promise chains
- Exception handling with try/catch
- Sequential vs. parallel patterns
- Generator functions and async iterators

### Control Mechanisms
- `AbortController` for cancellation
- Timeout patterns (Promise.race)
- Semaphores for concurrency limiting
- Mutexes for mutual exclusion

## Performance Considerations

| Pattern | Pros | Cons |
|---------|------|------|
| Promise.all() | Parallel execution, fail-fast | One failure cancels all |
| Promise.allSettled() | All results captured | Slower if error expected |
| Sequential async/await | Clear logic, error handling | Slower execution |
| Concurrent async/await | Faster execution | Complex error handling |
| Promise.race() | Fast response | Wastes losing promises |

## Common Pitfalls & Solutions

| Pitfall | Solution |
|---------|----------|
| Forgotten await | Enable linter rules, use ESLint async rules |
| Unhandled rejections | Add global rejection handlers, .catch() all |
| Race conditions in state | Use locks, atomic operations, version control |
| Deadlocks from circular waits | Enforce lock ordering, use timeouts |
| Memory leaks from retained promises | Clean up event listeners, cancel long-running operations |
| Event loop blocking | Use workers for CPU-intensive async work |

## Advanced Patterns

### Semaphore (Concurrency Limiting)
```javascript
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }
  
  async acquire() {
    while (this.current >= this.max) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.current++;
  }
  
  release() {
    this.current--;
    this.queue.shift()?.();
  }
}
```

### Timeout Wrapper
```javascript
function withTimeout(promise, ms, message) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });
  
  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timeoutHandle));
}
```

## Related Skills
- **dependency-management** (async module loading)
- **environment-configuration** (async setup initialization)
- **error-handling-resilience** (error recovery patterns)
- **logging-observability** (async operation tracing)

## References & Standards
- [MDN Promise Documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
- [JavaScript Async/Await Spec](https://tc39.es/ecma262/#sec-async-function-definitions)
- [Node.js Event Loop Guide](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/)
- [Concurrency Patterns (Go context)](https://pkg.go.dev/context)
- [Database Transaction Isolation](https://en.wikipedia.org/wiki/Isolation_(database_systems))

## Skill Maturity

**Level 1 (Foundational):** Basic Promises, async/await, simple error handling
**Level 2 (Intermediate):** Race condition awareness, retry patterns, concurrency limiting
**Level 3 (Advanced):** Deadlock prevention, complex coordination, performance optimization
**Current:** Level 2 (Intermediate)

---
**Last Updated:** 2026-02-06
**Phase:** 3 (Medium Priority)
