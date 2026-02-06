---
name: performance-testing
description: Load testing, stress testing, spike testing, and performance metrics with k6 and Apache JMeter
---

# Performance Testing

## Overview

Validate system behavior under various load conditions using load testing, stress testing, and spike testing. This skill covers test planning, baseline establishment, and capacity planning.

**Use this skill when:**
- Testing application before production release
- Estimating system capacity
- Identifying performance bottlenecks
- Planning for scaling
- Verifying performance improvements

## Performance Testing Types

### 1. Load Testing
- **Definition:** Simulate expected load (normal usage)
- **Goal:** Verify system meets performance requirements
- **Example:** 100 users over 5 minutes
- **Metrics to watch:**
  - Response time (p50, p95, p99)
  - Throughput (requests/second)
  - Error rate
  - Resource utilization (CPU, memory)

### 2. Stress Testing
- **Definition:** Increase load until system fails
- **Goal:** Find breaking point and behavior under stress
- **Example:** Gradually increase users to 10,000+
- **Key question:** What happens when limits are exceeded?

### 3. Spike Testing
- **Definition:** Sudden increase in load
- **Goal:** Verify system can handle traffic spikes
- **Example:** 100 → 5,000 users instantly
- **Watch for:** Cascading failures, stuck processes

### 4. Soak Testing
- **Definition:** Run normal load for extended period
- **Goal:** Find memory leaks and degradation over time
- **Duration:** 24-48 hours
- **Watch for:** Gradual slowdown, memory creep

## Load Testing with k6

**Installation:**
```bash
npm install --save-dev k6
```

**Basic Load Test:**
```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 0 },     // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% under 500ms
    http_req_failed: ['rate<0.1'],                    // <10% errors
  },
};

export default function () {
  const res = http.get('https://api.example.com/users');
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has user data': (r) => r.body.includes('id'),
  });
  
  sleep(1);
}
```

**Run Test:**
```bash
k6 run load-test.js
```

**Advanced: Multiple Endpoints**
```javascript
export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
};

export default function () {
  // Simulate user workflow
  const loginRes = http.post('https://api.example.com/login', {
    email: 'test@example.com',
    password: 'password123',
  });
  
  const token = loginRes.json('token');
  
  const headers = { 'Authorization': `Bearer ${token}` };
  
  http.get('https://api.example.com/dashboard', { headers });
  http.get('https://api.example.com/analytics', { headers });
  http.post('https://api.example.com/export', {}, { headers });
  
  sleep(1);
}
```

## Load Testing with Apache JMeter

**Test Plan Structure:**
```
Test Plan
├─ Thread Group (100 users, 5 min)
│  ├─ HTTP Request (GET /api/users)
│  ├─ HTTP Request (GET /api/users/1)
│  └─ Assertions (response time < 500ms)
├─ Listeners
│  ├─ View Results Tree
│  └─ Aggregate Report
```

**Aggregate Report Example:**
```
Label          Samples  Average  Min    Max   Std.Dev  Error%  Throughput
GET /api/users 1000     245ms    50ms   800ms 120ms    0.2%    3.3/sec
All            1000     245ms    50ms   800ms 120ms    0.2%    3.3/sec
```

## Performance Metrics

### Key Metrics

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Response Time (p95) | <500ms | <1000ms | >1000ms |
| Response Time (p99) | <1000ms | <2000ms | >2000ms |
| Error Rate | <0.1% | <1% | >1% |
| Throughput | Meets SLA | 10% below | >20% below |
| CPU Usage | <70% | <85% | >90% |
| Memory Usage | <70% | <85% | >90% |

### How to Read Results

```
Starting 100 users...
0s   - Request initiated
100s - 100 users ramped up
    p50 (median): 245ms
    p95: 485ms (95% of requests < 485ms)
    p99: 950ms (99% of requests < 950ms)
500s - System under sustained load
    Still healthy? Memory stable? CPU normal?
600s - Begin ramp down
```

## Identifying Bottlenecks

**When Response Time Increases:**

1. **Database Queries**
   ```sql
   -- Slow query analysis
   EXPLAIN ANALYZE SELECT * FROM users WHERE status = 'active';
   -- Add indexes if needed
   CREATE INDEX idx_users_status ON users(status);
   ```

2. **CPU Bottleneck**
   - Large computations
   - Inefficient algorithms
   - Too much logging

3. **Memory Issues**
   - Memory leaks (heap growing)
   - Large data structures
   - Cache unbounded growth

4. **I/O Wait**
   - Disk reads/writes
   - Network latency
   - Database locks

## Capacity Planning

**From Load Test Results:**

```
Average user takes 1KB of memory
Max users = 8GB RAM / 1KB per user = 8,000,000 users

Average request takes 10ms
Database can handle 100 queries/sec = 10,000 requests/sec
= 100 concurrent users at 100req/user-session

Multiply by safety factor (2-3x):
Capacity = 200-300 concurrent users
```

## Pre-Release Testing Checklist

- [ ] Baseline test established (normal load)
- [ ] Sustained load test (5+ min) successful
- [ ] Spike test (sudden traffic burst) successful
- [ ] Soak test (long duration) shows no memory leaks
- [ ] Database connections not exhausted
- [ ] Cache hit rates acceptable (>90%)
- [ ] Error rate below SLA (<0.1%)
- [ ] All response time percentiles met
- [ ] Resource utilization reasonable (CPU <70%, RAM <70%)
- [ ] Capacity plan documented
- [ ] Scaling strategy defined

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| High response time | Slow DB queries | Add indexes, optimize queries |
| Memory grows unbounded | Memory leak | Find unclosed connections/listeners |
| CPU spikes under load | Inefficient algorithm | Profile and refactor code |
| Connection pool exhausted | Too many simultaneous requests | Increase pool size or optimize |
| Cache misses | Poor cache strategy | Review cache keys and TTL |
| Timeouts | Downstream service slow | Optimize dependencies or increase timeout |

## Related Skills

- @test-automation - Automate performance tests in CI
- @backend-convex - Optimize database queries
- @frontend-nextjs - Profile frontend performance
- @metrics-reporting - Track performance over time
