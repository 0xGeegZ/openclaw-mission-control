---
name: backend-convex
description: Convex schema, queries, mutations, auth, and backend patterns.
---

# Backend Convex

## Purpose

Provide guidance and implementation patterns for Convex backend work.

## When to Use

- Adding or updating Convex schema or indexes
- Writing queries, mutations, or actions
- Enforcing auth and multi-tenancy rules

## Checklist

1. **Auth guard**
   - Ensure `requireAuth` / `requireAccountMember` / `requireAccountAdmin` is used.
2. **Multi-tenancy**
   - Filter by `accountId` in every query.
3. **Indexes**
   - Use `.withIndex()` to avoid full scans.
4. **Activities**
   - Log activity for state changes where required.
5. **Validation**
   - Validate input with Convex validators.

## Output Format

- **Plan:** short steps with key files
- **Changes:** summary of schema/query/mutation updates
- **Validation:** tests or runtime checks performed
