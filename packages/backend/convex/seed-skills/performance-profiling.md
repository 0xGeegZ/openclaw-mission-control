---
name: performance-profiling
description: CPU and memory profiling, Core Web Vitals optimization, bundle analysis, and performance budgets
---

# Performance Profiling

## Overview

Identify and eliminate performance bottlenecks using profiling tools, metrics, and systematic optimization. This skill covers both frontend (Core Web Vitals) and backend (CPU/memory) profiling.

**Use this skill when:**
- Investigating slow page loads
- Optimizing API response times
- Reducing memory consumption
- Analyzing bundle size
- Setting performance budgets

## Core Web Vitals (Frontend)

Google's metrics for user experience. These directly impact SEO.

### 1. Largest Contentful Paint (LCP)
- **What:** Time until largest visible element appears
- **Target:** <2.5 seconds
- **Causes:** Slow server response, large images, render-blocking JS

```bash
# Measure in Chrome DevTools
# Performance tab → Metrics → Largest Contentful Paint
```

**Optimization:**
- Preload critical resources: `<link rel="preload" href="/image.jpg">`
- Optimize images (WebP, lazy loading)
- Minimize CSS/JS blocking rendering
- Use CDN for content delivery

### 2. First Input Delay (FID) / Interaction to Next Paint (INP)
- **What:** Time browser responds to user interaction
- **Target:** <100ms (FID) or <200ms (INP)
- **Causes:** Heavy JavaScript, long tasks

```javascript
// Measure FID
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log('FID:', entry.processingDuration);
  }
});
observer.observe({ entryTypes: ['first-input'] });
```

**Optimization:**
- Break long tasks into chunks: `await new Promise(r => setTimeout(r, 0))`
- Defer non-critical JavaScript
- Use Web Workers for heavy computation
- Code splitting and lazy loading

### 3. Cumulative Layout Shift (CLS)
- **What:** Unexpected layout changes after page load
- **Target:** <0.1
- **Causes:** Unsized images, ads, late-loaded fonts

```css
/* Reserve space for images */
img {
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
}
```

**Optimization:**
- Set explicit dimensions for images/videos
- Avoid inserting content above existing content
- Use `font-display: swap` for custom fonts
- Reserve space for ads and iframes

## Backend Performance Profiling

### Node.js CPU Profiling

**Using Chrome DevTools:**
```bash
# Start Node with inspector
node --inspect app.js

# Open in Chrome: chrome://inspect
# Profiler tab → Start recording → 30s later → Stop
```

**Using clinic.js (recommended):**
```bash
npm install -g clinic
clinic doctor -- node app.js
# Navigate app for 30s
# Generates detailed report
```

**Reading CPU Profiles:**
- Call tree shows which functions consume CPU
- Flame graphs show call depth
- Time spent vs. time called

### Memory Profiling

**Heap Snapshots (Chrome DevTools):**
```javascript
// Take snapshot at suspicious point
console.profile('Memory');
// ... do work ...
console.profileEnd('Memory');
```

**Using clinic.js:**
```bash
clinic bubbleprof -- node app.js
# Shows event loop delays and memory issues
```

**Common Issues:**
- Memory leaks: Listeners not removed, circular references
- Unbounded caches: Grow without limit
- Large data structures: Keep unnecessary data

### Identifying Bottlenecks

```javascript
// Simple performance measurement
const start = performance.now();
expensiveOperation();
const end = performance.now();
console.log(`Operation took ${end - start}ms`);

// More detailed timing
const perf = performance.getEntriesByType('measure');
perf.forEach(entry => {
  console.log(`${entry.name}: ${entry.duration.toFixed(2)}ms`);
});
```

## Bundle Analysis

### Identifying Large Bundles

```bash
# Webpack Bundle Analyzer
npm install --save-dev webpack-bundle-analyzer

# In webpack.config.js
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
plugins: [new BundleAnalyzerPlugin()]

npm run build  # Generates report
```

**What to look for:**
- Duplicate dependencies
- Unnecessary large libraries
- Code not tree-shaken
- Vendor libraries included multiple times

### Optimization Techniques

```javascript
// 1. Code splitting by route
const Home = React.lazy(() => import('./pages/Home'));
const Admin = React.lazy(() => import('./pages/Admin'));

// 2. Dynamic imports for heavy libraries
const editor = await import('@monaco-editor/react');

// 3. Replace heavy libraries
// moment.js (67KB) → date-fns (13KB)
// lodash (70KB) → lodash-es (24KB with tree-shaking)

// 4. Compress images
// PNG → WebP (30-40% smaller)
// Use responsive images: srcset
```

## Performance Budgets

Enforce performance limits in CI/CD:

```json
{
  "bundles": [
    {
      "name": "main",
      "maxSize": "250 KB"
    },
    {
      "name": "vendor",
      "maxSize": "150 KB"
    }
  ],
  "metrics": [
    {
      "name": "LCP",
      "threshold": 2500  // milliseconds
    },
    {
      "name": "FID",
      "threshold": 100
    }
  ]
}
```

## Profiling Workflow

### 1. Baseline Measurement
```bash
# Measure before optimization
lighthouse https://example.com --output=json > baseline.json
```

### 2. Profile & Identify Issues
```bash
# Profile specific scenario
clinic doctor -- node app.js

# Record timeline in DevTools
# Check network tab for slow assets
```

### 3. Apply Optimization
- Make one change at a time
- Document hypothesis
- Implement fix

### 4. Measure Again
```bash
# Compare against baseline
lighthouse https://example.com --output=json > after.json
# Compare results
```

### 5. Document
- What was slow?
- Why was it slow?
- How was it optimized?
- Impact metrics

## Tools & Services

| Tool | Purpose | Price |
|------|---------|-------|
| Chrome DevTools | CPU/memory profiling, timeline | Free |
| Lighthouse | Web vitals scoring | Free |
| WebPageTest | Detailed performance analysis | Free |
| clinic.js | Node profiling | Free |
| Datadog/New Relic | Production monitoring | Paid |
| Speedcurve | Performance tracking | Paid |
| Sentry | Error + performance monitoring | Free/Paid |

## Common Performance Anti-patterns

**❌ Anti-patterns:**
- Large synchronous loops in event handlers
- Memory leaks from unremoved listeners
- Synchronous operations in critical paths
- Loading all data upfront (no pagination)
- Not compressing images/assets

**✅ Best practices:**
- Async/await for I/O operations
- Cleanup listeners in useEffect dependencies
- Lazy load below-the-fold content
- Paginate or virtualize large lists
- Compress and optimize all assets

## Related Skills

- @frontend-nextjs - Implement performance optimizations
- @backend-convex - Profile backend queries
- @test-automation - Measure performance in tests
- @security-hardening - Optimize while maintaining security
