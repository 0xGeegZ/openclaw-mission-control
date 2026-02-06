---
name: logging-observability
description: Structured logging patterns, distributed tracing, log aggregation, and observability for production systems
---

# Logging & Observability

## Overview

Build observable systems through structured logging, distributed tracing, and log aggregation. This skill covers instrumentation patterns that enable debugging production issues and monitoring system health.

**Use this skill when:**
- Investigating production errors
- Debugging complex issues
- Monitoring application performance
- Tracking user journeys across services
- Building alerting and monitoring systems

**Cross-functional pairing:** @qa **regression-testing** — Observability data helps validate test behavior and catch regressions in production

---

## Structured Logging

### From Unstructured to Structured

```typescript
// ❌ Bad: unstructured logs (hard to parse, search, aggregate)
console.log('User login attempt at 2026-02-06T10:00:00Z from 192.168.1.1');
console.log('Successfully authenticated user');
console.log('Database query took 45ms');

// ✅ Good: structured logs (JSON, searchable, queryable)
const logger = {
  info: (message, context) => console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    message,
    ...context,
  })),
};

logger.info('User login attempt', {
  userId: user._id,
  ipAddress: '192.168.1.1',
  userAgent: req.headers['user-agent'],
});

logger.info('User authenticated', {
  userId: user._id,
  method: 'oauth',
  duration: 150,
});
```

### Log Levels and Usage

```typescript
enum LogLevel {
  DEBUG = 'DEBUG',   // Detailed info for developers (off in production)
  INFO = 'INFO',     // General informational messages
  WARN = 'WARN',     // Warning conditions (recoverable errors)
  ERROR = 'ERROR',   // Error conditions (unrecoverable)
  FATAL = 'FATAL',   // System is shutting down
}

// Examples
logger.debug('Database query executed', { query, params, result });
logger.info('User created', { userId, email });
logger.warn('Slow query detected', { duration: 5000, threshold: 1000 });
logger.error('Payment processing failed', { reason, userId, orderId, attempt: 1 });
logger.fatal('Database connection lost', { error: err.message });
```

### Structured Log Format

```typescript
interface StructuredLog {
  timestamp: string;      // ISO 8601
  level: LogLevel;        // DEBUG, INFO, WARN, ERROR, FATAL
  message: string;        // Unique, searchable message
  traceId: string;        // Links logs from same request
  spanId: string;         // Links logs within a span
  userId?: string;        // For user-specific queries
  requestId?: string;     // For request-specific queries
  duration?: number;      // In milliseconds
  error?: {
    message: string;
    stack: string;
    code: string;
  };
  context: Record<string, any>; // Additional structured data
}

// Example log entry
const log: StructuredLog = {
  timestamp: '2026-02-06T10:00:00.123Z',
  level: 'INFO',
  message: 'Database query executed',
  traceId: 'abc123',
  spanId: 'span-456',
  userId: 'user-789',
  duration: 45,
  context: {
    table: 'posts',
    filter: 'userId = ?',
    rowsReturned: 25,
  },
};
```

### Logging Context in Convex

```typescript
// Helper for structured logging in mutations/queries
export const createLogger = (ctx) => {
  const traceId = crypto.randomUUID();
  
  return {
    debug: (message, context = {}) => {
      if (process.env.DEBUG) {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'DEBUG',
          message,
          traceId,
          ...context,
        }));
      }
    },
    
    info: (message, context = {}) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message,
        traceId,
        ...context,
      }));
    },
    
    error: (message, error, context = {}) => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message,
        traceId,
        error: {
          message: error?.message,
          stack: error?.stack,
          code: error?.code,
        },
        ...context,
      }));
    },
  };
};

// Usage in mutation
export const createPost = mutation({
  args: { title: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    const logger = createLogger(ctx);
    
    logger.info('Creating post', { title: args.title });
    
    try {
      const postId = await ctx.db.insert('posts', {
        title: args.title,
        content: args.content,
        userId: ctx.userId,
        createdAt: Date.now(),
      });
      
      logger.info('Post created successfully', {
        postId,
        duration: Date.now() - startTime,
      });
      
      return postId;
    } catch (error) {
      logger.error('Failed to create post', error, {
        title: args.title,
      });
      throw error;
    }
  },
});
```

---

## Distributed Tracing

### Trace IDs and Span IDs

**Trace ID:** Unique identifier for an entire user request across services
**Span ID:** Identifier for a specific operation within the trace

```typescript
// Request starts with trace ID
// Trace: abc-123-def
//   ├─ Span 1: HTTP request received
//   ├─ Span 2: Authenticate user (50ms)
//   ├─ Span 3: Query database (45ms)
//   │   ├─ Span 3.1: Build query (5ms)
//   │   └─ Span 3.2: Execute query (40ms)
//   ├─ Span 4: Process results (10ms)
//   └─ Span 5: Send response (2ms)

interface TraceContext {
  traceId: string;
  parentSpanId?: string;
  spanId: string;
  startTime: number;
}

export const createSpan = (
  traceId: string,
  spanName: string,
  parentSpan?: TraceContext
): TraceContext => ({
  traceId,
  parentSpanId: parentSpan?.spanId,
  spanId: `${spanName}-${crypto.randomUUID()}`,
  startTime: Date.now(),
});

// Log span completion
export const endSpan = (span: TraceContext) => {
  const duration = Date.now() - span.startTime;
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'DEBUG',
    message: 'Span completed',
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    duration,
  }));
};

// Usage
const traceId = 'abc-123-def';
const authSpan = createSpan(traceId, 'authenticate');
await authenticateUser(user);
endSpan(authSpan);

const dbSpan = createSpan(traceId, 'database', authSpan);
const posts = await fetchUserPosts(userId);
endSpan(dbSpan);
```

---

## Log Aggregation & Analysis

### Setting Up Log Aggregation

**Tools:** Datadog, ELK Stack, Splunk, CloudWatch, Loggly

```typescript
// Example: Send logs to external service
const sendLog = async (log: StructuredLog) => {
  if (process.env.LOG_SERVICE_URL) {
    try {
      await fetch(process.env.LOG_SERVICE_URL, {
        method: 'POST',
        body: JSON.stringify(log),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Fallback: log to console if service unavailable
      console.error('Failed to send log to service:', error);
    }
  }
};

// Buffer logs in batch for efficiency
const logBuffer = [];
const BATCH_SIZE = 100;
const FLUSH_INTERVAL = 5000; // 5 seconds

const addLog = async (log: StructuredLog) => {
  logBuffer.push(log);
  
  if (logBuffer.length >= BATCH_SIZE) {
    await flushLogs();
  }
};

const flushLogs = async () => {
  if (logBuffer.length === 0) return;
  
  const batch = logBuffer.splice(0, logBuffer.length);
  await Promise.all(batch.map(sendLog));
};

// Flush periodically
setInterval(flushLogs, FLUSH_INTERVAL);
```

### Querying Logs

```typescript
// Examples in log aggregation service (Datadog syntax)

// Find all errors from specific user
// level:ERROR AND userId:"user-123"

// Find slow database queries
// message:"Database query executed" AND duration:>1000

// Find errors in past hour
// level:ERROR AND timestamp:[now-1h TO now]

// Analyze error frequency by type
// GROUP BY error.code | COUNT AS error_count | SORT error_count DESC

// Correlation: Find all requests that led to payment failure
// traceId IN (SELECT traceId FROM logs WHERE message:"Payment failed")
```

---

## Performance Monitoring

### Metrics to Track

```typescript
interface PerformanceMetrics {
  // Latency
  p50: number;  // 50th percentile (median)
  p95: number;  // 95th percentile
  p99: number;  // 99th percentile
  
  // Throughput
  requestsPerSecond: number;
  
  // Errors
  errorRate: number;
  
  // Saturation
  cpuUsage: number;
  memoryUsage: number;
  databaseConnections: number;
}

// Log performance metrics
logger.info('Metrics snapshot', {
  metrics: {
    apiLatencyP95: 150, // ms
    databaseQueryP95: 45, // ms
    errorRate: 0.001, // 0.1%
    requestsPerSecond: 500,
  },
  timestamp: new Date().toISOString(),
});
```

### Alerting Thresholds

```typescript
const ALERT_THRESHOLDS = {
  API_LATENCY_P95_MS: 1000,
  ERROR_RATE_PERCENT: 1.0,
  DATABASE_CONNECTIONS_PERCENT: 80,
  MEMORY_USAGE_PERCENT: 85,
  QUEUE_LENGTH: 10000,
};

const checkAlerts = (metrics: PerformanceMetrics) => {
  if (metrics.p95 > ALERT_THRESHOLDS.API_LATENCY_P95_MS) {
    sendAlert({
      severity: 'warning',
      message: `API latency P95 is ${metrics.p95}ms (threshold: ${ALERT_THRESHOLDS.API_LATENCY_P95_MS}ms)`,
    });
  }
  
  if (metrics.errorRate > ALERT_THRESHOLDS.ERROR_RATE_PERCENT) {
    sendAlert({
      severity: 'critical',
      message: `Error rate is ${metrics.errorRate}% (threshold: ${ALERT_THRESHOLDS.ERROR_RATE_PERCENT}%)`,
    });
  }
};
```

---

## Best Practices

### What To Log

✅ **DO log:**
- User actions (login, create post, purchase)
- Errors and exceptions (with full stack trace)
- Performance metrics (query time, API latency)
- Security events (failed auth, permission denied)
- System events (service started, database connected)

❌ **DON'T log:**
- Passwords, API keys, tokens
- Personal information (without consent)
- Sensitive financial data
- Entire request/response bodies (log relevant fields only)
- Spam messages (e.g., log every loop iteration)

### Log Volume Management

```typescript
// Sampling: log 1% of successful requests, 100% of errors
const shouldLog = (level: LogLevel, duration: number) => {
  if (level === 'ERROR' || level === 'FATAL') return true;
  if (duration > 1000) return true; // Log slow requests
  if (Math.random() < 0.01) return true; // 1% sample
  return false;
};

// Rate limiting: prevent log spam
const logRateLimiter = new Map<string, number>();

const canLog = (key: string, maxPerSecond = 100) => {
  const now = Date.now();
  const count = logRateLimiter.get(key) || 0;
  
  if (count >= maxPerSecond) return false;
  
  logRateLimiter.set(key, count + 1);
  setTimeout(() => logRateLimiter.delete(key), 1000);
  
  return true;
};
```

---

## Related Skills

- @database-optimization — Log query performance
- @error-handling-resilience — Log failures and recovery attempts
- @debug-issue — Use logs to investigate problems
- @regression-testing (QA) — Use observability for test validation

## References

- [12 Factor Apps: Logs](https://12factor.net/logs)
- [Google Cloud Logging Best Practices](https://cloud.google.com/architecture/devops-measurement-logging-patterns)
- [Datadog Logging Best Practices](https://docs.datadoghq.com/logs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/)
