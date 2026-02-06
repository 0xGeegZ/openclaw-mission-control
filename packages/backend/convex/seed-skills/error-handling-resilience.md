---
name: error-handling-resilience
description: Exception handling patterns, circuit breakers, retry logic, fallback strategies, and graceful degradation
---

# Error Handling & Resilience

## Overview

Build resilient systems that gracefully handle failures and recover automatically. This skill covers defensive programming patterns, retry logic, circuit breakers, and strategies for maintaining availability during partial failures.

**Use this skill when:**
- Calling external APIs or services
- Handling network failures
- Designing fault-tolerant systems
- Planning recovery strategies
- Building redundancy and failover logic

**Cross-functional pairing:** @qa **contract-testing-openapi** — Ensure error responses conform to API contracts and are properly tested

---

## Error Classification

### Expected vs. Unexpected Errors

```typescript
// Error types
enum ErrorType {
  // Expected (client/request errors) - don't retry
  VALIDATION = 'VALIDATION',         // Invalid input
  AUTHENTICATION = 'AUTHENTICATION', // Missing/invalid auth
  AUTHORIZATION = 'AUTHORIZATION',   // Insufficient permissions
  NOT_FOUND = 'NOT_FOUND',          // Resource doesn't exist
  CONFLICT = 'CONFLICT',             // Resource already exists
  
  // Transient (server/temporary) - retry with backoff
  TIMEOUT = 'TIMEOUT',               // Request timed out
  RATE_LIMIT = 'RATE_LIMIT',         // Too many requests
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE', // Server down
  TEMPORARY_FAILURE = 'TEMPORARY_FAILURE',     // Network glitch
  
  // Unexpected (programmer errors) - log and alert
  INTERNAL_ERROR = 'INTERNAL_ERROR', // Unhandled exception
  UNKNOWN = 'UNKNOWN',               // Unknown error
}

// Map HTTP status to error type
const httpStatusToErrorType = (status: number): ErrorType => {
  if (status === 400) return ErrorType.VALIDATION;
  if (status === 401) return ErrorType.AUTHENTICATION;
  if (status === 403) return ErrorType.AUTHORIZATION;
  if (status === 404) return ErrorType.NOT_FOUND;
  if (status === 409) return ErrorType.CONFLICT;
  if (status === 408 || status === 504) return ErrorType.TIMEOUT;
  if (status === 429) return ErrorType.RATE_LIMIT;
  if (status === 503) return ErrorType.SERVICE_UNAVAILABLE;
  if (status >= 500) return ErrorType.INTERNAL_ERROR;
  return ErrorType.UNKNOWN;
};

// Determine if error is retryable
const isRetryable = (errorType: ErrorType): boolean => {
  const retryableErrors = [
    ErrorType.TIMEOUT,
    ErrorType.RATE_LIMIT,
    ErrorType.SERVICE_UNAVAILABLE,
    ErrorType.TEMPORARY_FAILURE,
  ];
  return retryableErrors.includes(errorType);
};
```

---

## Retry Logic

### Exponential Backoff with Jitter

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFraction: number; // 0-1, recommended 0.1
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFraction: 0.1,
};

// Calculate delay for retry attempt
const calculateRetryDelay = (
  attempt: number,
  config: RetryConfig
): number => {
  // Exponential backoff: 100ms, 200ms, 400ms, 800ms, ...
  const baseDelay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs
  );
  
  // Add jitter to prevent thundering herd
  const jitter = baseDelay * config.jitterFraction * Math.random();
  
  return baseDelay + jitter;
};

// Retry function
export const withRetry = async <T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      const errorType = classifyError(error);
      
      // Don't retry if error is not retryable
      if (!isRetryable(errorType)) {
        throw error;
      }
      
      // Don't sleep on last attempt
      if (attempt < config.maxAttempts - 1) {
        const delayMs = calculateRetryDelay(attempt, config);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      console.log(`Retry attempt ${attempt + 1}/${config.maxAttempts} after ${delayMs}ms`);
    }
  }
  
  throw lastError;
};

// Usage
const result = await withRetry(
  () => fetchFromExternalAPI(),
  {
    maxAttempts: 5,
    initialDelayMs: 50,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitterFraction: 0.1,
  }
);
```

### Circuit Breaker Pattern

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation, requests pass through
  OPEN = 'OPEN',           // Too many failures, requests fail fast
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening (e.g., 5)
  successThreshold: number;      // Successes to close from half-open (e.g., 2)
  timeoutMs: number;             // Time before half-open (e.g., 30000ms)
}

class CircuitBreaker<T> {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  
  constructor(
    private operation: () => Promise<T>,
    private config: CircuitBreakerConfig
  ) {}
  
  async call(): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      
      if (timeSinceLastFailure > this.config.timeoutMs) {
        // Try to recover
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        console.log('Circuit breaker: transitioning to HALF_OPEN');
      } else {
        // Still open, fail fast
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await this.operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        console.log('Circuit breaker: CLOSED (recovered)');
      }
    }
  }
  
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.config.failureThreshold && 
        this.state === CircuitState.CLOSED) {
      this.state = CircuitState.OPEN;
      console.log('Circuit breaker: OPEN (too many failures)');
    }
  }
}

// Usage
const apiBreaker = new CircuitBreaker(
  () => fetchFromAPI(),
  {
    failureThreshold: 5,
    successThreshold: 2,
    timeoutMs: 30000,
  }
);

// Requests will fail fast if service is down
const data = await apiBreaker.call();
```

---

## Fallback Strategies

### Graceful Degradation

```typescript
// ❌ Bad: no fallback, complete failure
async function getUserDashboard(userId: string) {
  const [profile, posts, followers] = await Promise.all([
    fetchUserProfile(userId),    // External API
    fetchUserPosts(userId),      // Database
    fetchFollowerCount(userId),  // External service
  ]);
  
  return { profile, posts, followers };
}

// ✅ Good: fallback for optional data
async function getUserDashboard(userId: string) {
  const profile = await fetchUserProfile(userId); // Critical, fail
  
  // Non-critical, use fallbacks
  let posts = [];
  try {
    posts = await fetchUserPosts(userId);
  } catch (error) {
    console.warn('Failed to fetch posts, showing empty', { userId });
    posts = [];
  }
  
  let followers = 0;
  try {
    followers = await fetchFollowerCount(userId);
  } catch (error) {
    console.warn('Failed to fetch follower count, showing 0', { userId });
    followers = 0;
  }
  
  return { profile, posts, followers };
}
```

### Cache Fallback

```typescript
const cache = new Map<string, { data: any; expireAt: number }>();

async function getWithFallback<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 5 * 60 * 1000 // 5 minutes default
): Promise<T> {
  // Try fresh data first
  try {
    const data = await fetcher();
    
    // Cache for fallback
    cache.set(key, {
      data,
      expireAt: Date.now() + ttlMs,
    });
    
    return data;
  } catch (error) {
    // Fallback to cached data if available
    const cached = cache.get(key);
    
    if (cached && Date.now() < cached.expireAt) {
      console.warn('Using stale cache due to fetch error', { key });
      return cached.data;
    }
    
    // No cache available, fail
    throw error;
  }
}

// Usage
const userData = await getWithFallback(
  `user-${userId}`,
  () => fetchFromExternalAPI(userId),
  10 * 60 * 1000 // 10 minute cache
);
```

---

## Timeout Handling

```typescript
// Helper to add timeout to any promise
const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
};

// Usage
try {
  const result = await withTimeout(
    fetchFromSlowAPI(),
    5000 // 5 second timeout
  );
} catch (error) {
  if (error.message.includes('timed out')) {
    console.error('API request timed out');
    // Use fallback
  }
}

// In Convex mutations/queries
export const getUserWithTimeout = query({
  handler: async (ctx) => {
    return withTimeout(
      ctx.db.query('users').collect(),
      2000 // 2 second database timeout
    );
  },
});
```

---

## Bulkhead Pattern

Isolate failures so they don't cascade across the system.

```typescript
// Limit concurrent requests to external service
class Bulkhead {
  private activeRequests = 0;
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  
  constructor(private maxConcurrent: number) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      
      try {
        return await fn();
      } finally {
        this.activeRequests--;
        this.processQueue();
      }
    }
    
    // Queue if at capacity
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn,
        resolve,
        reject,
      });
    });
  }
  
  private async processQueue() {
    if (this.queue.length === 0) return;
    
    const { fn, resolve, reject } = this.queue.shift()!;
    
    try {
      const result = await this.execute(fn);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }
}

// Usage: limit API calls to 10 concurrent
const apiBulkhead = new Bulkhead(10);

const response = await apiBulkhead.execute(() =>
  fetchFromExternalAPI()
);
```

---

## Error Response Format

```typescript
// Consistent error response format for APIs
interface ErrorResponse {
  success: false;
  error: {
    code: string;        // Machine-readable code
    message: string;     // User-friendly message
    details?: any;       // Optional additional details
    traceId?: string;    // For debugging
  };
}

// Example implementations
const createValidationError = (details: any): ErrorResponse => ({
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid request parameters',
    details,
  },
});

const createNotFoundError = (resource: string): ErrorResponse => ({
  success: false,
  error: {
    code: 'NOT_FOUND',
    message: `${resource} not found`,
  },
});

const createInternalError = (traceId: string): ErrorResponse => ({
  success: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    traceId,
  },
});
```

---

## Related Skills

- @logging-observability — Log errors and recovery attempts
- @database-optimization — Handle database connection failures
- @doc-generation — Document error codes and recovery procedures
- @contract-testing-openapi (QA) — Validate error responses match contracts

## References

- [Release It! By Michael Nygard](https://pragprog.com/titles/mnee2/release-it-second-edition/) — Circuit breakers, bulkheads, timeouts
- [AWS Well-Architected Framework: Resilience](https://docs.aws.amazon.com/wellarchitected/latest/resilience-pillar/)
- [Google SRE Book: Handling Overload](https://sre.google/books/)
- [Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
