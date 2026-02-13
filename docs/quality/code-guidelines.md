# Backend Code Guidelines - Phase 3 Audit Compliance

## Overview

This document outlines code quality standards for the OpenClaw Mission Control backend, as established during Phase 3 Backend Audit Remediation.

## Core Standards

### 1. Error Handling - ConvexError Pattern

All errors must use `ConvexError` with `ErrorCode` enum:

```typescript
import { ConvexError, ErrorCode } from "./lib/errors";

// Resource not found
throw new ConvexError(ErrorCode.NOT_FOUND, "Document not found", { docId });

// Authorization failure
throw new ConvexError(ErrorCode.FORBIDDEN, "Access denied", { userId, accountId });

// Validation error
throw new ConvexError(ErrorCode.VALIDATION_ERROR, "Invalid input", { field, value });

// State transition error
throw new ConvexError(ErrorCode.INVALID_TRANSITION, "Cannot change status", { from, to });
```

### 2. Type Safety - Explicit Return Types

All handlers must have explicit return type annotations:

```typescript
// Query returns collection
export const list = query({
  handler: async (ctx, args): Promise<Doc<"agents">[]> => { ... },
});

// Query returns single item or null
export const get = query({
  handler: async (ctx, args): Promise<Doc<"agents"> | null> => { ... },
});

// Mutation returns ID
export const create = mutation({
  handler: async (ctx, args): Promise<Id<"agents">> => { ... },
});

// Mutation returns void
export const update = mutation({
  handler: async (ctx, args): Promise<void> => { ... },
});
```

### 3. Safe ID Casting

Use `assertId` helper instead of unsafe casting:

```typescript
// ❌ Avoid
const agentId = args.agentId as Id<"agents">;

// ✅ Use assertion helper
import { assertId } from "./lib/errors";
const agentId = assertId(args.agentId, "agents");
```

### 4. Authorization Checks

Always verify permissions before mutations:

```typescript
const agent = await ctx.db.get(args.agentId);
const { userId } = await requireAccountMember(ctx, agent.accountId);

if (agent.createdBy !== userId) {
  throw new ConvexError(ErrorCode.FORBIDDEN, "Not authorized");
}

// Safe to update
await ctx.db.patch(args.agentId, updates);
```

### 5. Code Reuse - Factory Functions

Use factory functions to eliminate boilerplate:

```typescript
import { listByAccount, getByIndex, updateWithValidation } from "./lib/factories";

// Instead of repeating query logic
const agents = await listByAccount(ctx, "agents", accountId);

// Get by unique field
const agent = await getByIndex(
  ctx, "agents", "by_account_slug",
  (q) => q.eq("accountId", accountId).eq("slug", slug)
);

// Update with built-in validation
await updateWithValidation(ctx, "agents", agentId, { status: "online" });
```

### 6. Validation Helpers

Use consolidated validation from `lib/validation.ts`:

```typescript
import { validateStringField, chainValidations } from "./lib/validation";

const results = [
  validateStringField(args.title, "title", 1, 500),
  validateStringField(args.description, "description", 0, 10000),
];

chainValidations(...results); // Throws on first failure
```

### 7. Settings Access

Use safe helpers instead of casting:

```typescript
import { getOrchestratorAgentId, hasOrchestrator } from "./lib/settings";

// ❌ Avoid
const id = (account.settings as any)?.orchestratorAgentId;

// ✅ Use helpers
const id = getOrchestratorAgentId(account);
const configured = hasOrchestrator(account);
```

### 8. Structured Logging

Log all state changes using `logActivity`:

```typescript
import { logActivity } from "./lib/activity";

await logActivity({
  ctx,
  accountId: args.accountId,
  type: "agent_status_changed",
  actorType: "user",
  actorId: userId,
  targetType: "agent",
  targetId: agentId,
  meta: { oldStatus: "offline", newStatus: "online" },
});
```

## Error Code Mapping

```
NOT_FOUND: 404
CONFLICT: 409
FORBIDDEN: 403
UNAUTHORIZED: 401
VALIDATION_ERROR: 400
INVALID_INPUT: 400
INVALID_STATE: 422
INVALID_TRANSITION: 422
OPERATION_FAILED: 500
INTERNAL_ERROR: 500
NOT_IMPLEMENTED: 501
```

## Key References

- `lib/errors.ts` - ConvexError and assertion helpers
- `lib/validation.ts` - Validation patterns
- `lib/factories.ts` - Query/mutation boilerplate reduction
- `lib/settings.ts` - Safe settings access
- `lib/activity.ts` - Activity logging

---

Last Updated: Phase 3 Backend Audit
