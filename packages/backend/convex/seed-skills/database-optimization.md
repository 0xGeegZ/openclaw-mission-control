---
name: database-optimization
description: Convex schema design, indexing strategies, query optimization, performance tuning, and safe migration patterns
---

# Database Optimization

## Overview

Optimize database performance through intelligent schema design, indexing strategies, and query optimization. This skill covers Convex-specific patterns for building scalable, efficient data layers.

**Use this skill when:**
- Designing database schemas for new features
- Identifying slow queries and bottlenecks
- Planning database migrations
- Implementing indexing strategies
- Optimizing existing data structures

**Cross-functional pairing:** @qa **test-coverage-analysis** — Database changes should include coverage validation of new/modified query paths

---

## Convex Schema Design

### Data Normalization vs. Denormalization Trade-offs

**Normalization (Reduces redundancy):**
```typescript
// Normalized: separate tables
export const users = defineTable({
  name: v.string(),
  email: v.string(),
  organizationId: v.id('organizations'),
});

export const organizations = defineTable({
  name: v.string(),
  slug: v.string(),
});

export const memberships = defineTable({
  userId: v.id('users'),
  organizationId: v.id('organizations'),
  role: v.union(v.literal('admin'), v.literal('member')),
});

// Query: Join required to get user's org
const user = await ctx.db.get(userId);
const org = await ctx.db.get(user.organizationId);
const memberships = await ctx.db
  .query('memberships')
  .filter(q => q.eq(q.field('userId'), userId))
  .collect();
```

**Denormalization (Improves query speed, increases storage):**
```typescript
// Denormalized: cache org data on user doc
export const users = defineTable({
  name: v.string(),
  email: v.string(),
  organizationId: v.id('organizations'),
  // Cached data
  organizationName: v.string(),
  organizationSlug: v.string(),
  userRole: v.union(v.literal('admin'), v.literal('member')),
});

// Single query: no joins needed
const user = await ctx.db.get(userId);
// user.organizationName, user.organizationSlug available immediately
```

**Decision Matrix:**
| Scenario | Approach | Reason |
|----------|----------|--------|
| Frequently queried relationships | Denormalize | Reduces query count |
| Infrequently accessed data | Normalize | Saves storage, reduces update surface |
| Data changes frequently | Normalize | Easier maintenance, no cache busting |
| Real-time queries with < 100ms target | Denormalize | Eliminates join latency |
| Analytics/reporting | Normalize | Flexibility for aggregations |

---

## Indexing Strategies in Convex

### When to Index

**Create indexes for:**
- Frequently filtered fields (`where` clauses)
- Sorted fields (`orderBy`)
- Fields used in joins
- Compound queries (multiple filters)

**Avoid indexing:**
- Fields rarely queried
- Low cardinality fields (few unique values)
- Fields that change constantly
- Text fields (use full-text search instead)

### Index Patterns

```typescript
// Single-field index
export const usersTable = defineTable({
  email: v.string(),
  status: v.string(),
}).index('email', ['email'])
 .index('status', ['status']);

// Compound index (multiple fields)
export const ordersTable = defineTable({
  userId: v.id('users'),
  status: v.string(),
  createdAt: v.number(),
}).index('userStatus', ['userId', 'status'])
 .index('statusCreated', ['status', 'createdAt']);

// Query efficiently using indexes
async function getUserOrders(ctx, userId, status) {
  // Uses userStatus index: fast
  return await ctx.db
    .query('orders')
    .filter(q => q.and(
      q.eq(q.field('userId'), userId),
      q.eq(q.field('status'), status)
    ))
    .collect();
}

async function getRecentOrders(ctx, status) {
  // Uses statusCreated index, sorts by createdAt
  return await ctx.db
    .query('orders')
    .filter(q => q.eq(q.field('status'), status))
    .order('desc')
    .collect();
}
```

### Index Cost Analysis

```typescript
// ❌ Inefficient: query without index
async function findUserByPartialEmail(ctx, emailPattern) {
  return await ctx.db
    .query('users')
    .filter(q => q.match(q.field('email'), emailPattern))
    .collect(); // Scans entire table!
}

// ✅ Better: exact match with index
async function findUserByEmail(ctx, email) {
  return await ctx.db
    .query('users')
    .filter(q => q.eq(q.field('email'), email))
    .collect(); // Uses index, O(log n)
}

// ✅ Best: use full-text search for patterns
export const usersTable = defineTable({
  email: v.string(),
  name: v.string(),
}).searchIndex('search_email', {
  searchField: 'email',
});

async function searchUsers(ctx, query) {
  return await ctx.db
    .query('users')
    .search('search_email', q => q.search(query))
    .collect();
}
```

---

## Query Optimization

### N+1 Query Problem

```typescript
// ❌ Bad: N+1 queries
async function getUsersWithOrgs(ctx) {
  const users = await ctx.db.query('users').collect();
  
  // This loops through and makes N+1 queries!
  return Promise.all(users.map(async user => ({
    ...user,
    org: await ctx.db.get(user.organizationId), // Extra query per user
  })));
}

// ✅ Good: batch load with index
async function getUsersWithOrgs(ctx) {
  const users = await ctx.db.query('users').collect();
  
  // Get unique org IDs
  const orgIds = [...new Set(users.map(u => u.organizationId))];
  
  // Single query to get all orgs
  const orgs = new Map();
  for (const orgId of orgIds) {
    const org = await ctx.db.get(orgId);
    orgs.set(orgId, org);
  }
  
  return users.map(user => ({
    ...user,
    org: orgs.get(user.organizationId),
  }));
}

// ✅ Best: denormalize when appropriate
async function getUsersWithOrgs(ctx) {
  // If org data is cached, single query
  return await ctx.db.query('users').collect();
}
```

### Pagination for Large Result Sets

```typescript
// ❌ Bad: loading all results
async function getAllPosts(ctx) {
  return await ctx.db.query('posts').collect(); // Could be 100k+ docs!
}

// ✅ Good: paginate with cursor
async function getPosts(ctx, cursor, pageSize = 20) {
  let query = ctx.db.query('posts').order('desc');
  
  if (cursor) {
    query = query.filter(q => q.lt(q.field('_creationTime'), cursor));
  }
  
  const posts = await query.take(pageSize + 1);
  
  return {
    posts: posts.slice(0, pageSize),
    nextCursor: posts.length > pageSize ? posts[pageSize]._creationTime : null,
  };
}

// Usage
const { posts, nextCursor } = await ctx.runQuery(getPosts, null);
const { posts: nextBatch } = await ctx.runQuery(getPosts, nextCursor);
```

---

## Performance Tuning

### Identifying Slow Queries

**Convex query logs show:**
- Execution time (ms)
- Rows scanned
- Indexes used
- Estimated cost

**Warning signs:**
- Full table scans (rows scanned >> results returned)
- Multiple sequential queries for related data
- Large result sets paginated client-side

### Query Metrics

```typescript
// Log query performance in development
async function findPostsForUser(ctx, userId) {
  const start = Date.now();
  
  const posts = await ctx.db
    .query('posts')
    .filter(q => q.eq(q.field('userId'), userId))
    .order('desc')
    .collect();
  
  const duration = Date.now() - start;
  console.log(`Query took ${duration}ms, returned ${posts.length} docs`);
  
  return posts;
}

// Track over time: if regression detected, investigate indexing
```

### Common Optimization Techniques

| Issue | Solution | Trade-off |
|-------|----------|-----------|
| **Slow filters** | Add index | Storage cost |
| **N+1 queries** | Batch/denormalize | Complexity or storage |
| **Large sorts** | Index on sort field | Maintenance |
| **Complex filters** | Simplify queries | May require schema change |
| **Full table scans** | Add covering index | Write latency |

---

## Safe Database Migrations

### Migration Checklist

```typescript
// 1. ADD NEW FIELD (backward compatible)
export const usersTable = defineTable({
  email: v.string(),
  name: v.string(),
  // NEW: Optional field with default
  avatarUrl: v.optional(v.string()),
});

// 2. BACKFILL DATA (mutation)
export const backfillAvatars = internalMutation({
  async handler(ctx) {
    const users = await ctx.db.query('users').collect();
    
    for (const user of users) {
      if (!user.avatarUrl) {
        await ctx.db.patch(user._id, {
          avatarUrl: `/avatars/${user._id}.png`,
        });
      }
    }
    
    console.log(`Backfilled ${users.length} users`);
  },
});

// 3. MAKE FIELD REQUIRED (after backfill)
// Remove v.optional() from schema
// Verify all docs have the field
// Commit the change

// 4. REMOVE OLD FIELD (after code cleanup)
// Remove all references from mutations/queries
// Remove from schema
// Clean up in database
```

### Rollback Strategy

```typescript
// Before migration, export current schema and data
export const exportDatabase = internalMutation({
  async handler(ctx) {
    // Store snapshot for rollback
    const snapshot = {
      timestamp: Date.now(),
      tables: {},
    };
    
    // Would export all data to backup table
    // Store snapshot safely
  },
});

// If needed, restore from snapshot
export const restoreFromSnapshot = internalMutation({
  async handler(ctx, snapshotId) {
    // Restore previous state
  },
});
```

---

## Related Skills

- @convex-backend — Convex mutations and queries
- @logging-observability — Monitor query performance with structured logs
- @test-coverage-analysis (QA) — Ensure query changes are tested
- @performance-profiling — Profile full app including database tier

## References

- [Convex Docs: Data Modeling](https://docs.convex.dev)
- [Indexing Best Practices](https://docs.convex.dev/database/indexes)
- [Query Performance](https://docs.convex.dev/database/performance)
