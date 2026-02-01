# Module 03: Auth & Tenancy

> Implement authentication guards and multi-tenancy infrastructure.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Multi-tenant architecture concept
2. **`docs/mission-control-cursor-core-instructions.md`** — Auth invariants (Section 4.2, 4.3)
3. **`.cursor/rules/05-convex.mdc`** — Authentication patterns with `ctx.auth`

**Key invariants:**
- **Invariant A1:** User calls require membership in `memberships` table
- **Invariant A2:** Role-based actions require `role in ["owner","admin"]`
- **Invariant A3:** Agents never use user auth — only service auth
- **Invariant T1-T3:** Every query scoped to `accountId`

---

## 1. Context & Goal

We are implementing the authentication and multi-tenancy layer for Mission Control. This module provides:

- **Auth guards**: Functions to verify user identity in Convex
- **Tenancy helpers**: Functions to enforce account-level access control
- **Account management**: CRUD operations for accounts
- **Membership management**: User-account relationships with roles
- **Service auth**: Authentication for runtime service calls

**What we're building:**
- `requireAuth()` - Verify user is authenticated
- `requireAccountMember()` - Verify user belongs to account
- `requireAccountAdmin()` - Verify user is admin/owner
- Account CRUD mutations
- Membership CRUD mutations
- Service-only function infrastructure

**Key constraints:**
- Uses Clerk for user authentication (already configured)
- Every query/mutation that accesses account data MUST use auth guards
- Service calls use separate authentication (not user tokens)
- All operations must log activities (except reads)

---

## 2. Codebase Research Summary

### Files to Reference

- `packages/backend/convex/schema.ts` - Schema for accounts, memberships
- `packages/shared/src/types/index.ts` - MemberRole type
- `apps/web/app/layout.tsx` - ClerkProvider setup

### Clerk + Convex Integration Pattern

```typescript
// In Convex function
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new Error("Unauthenticated");

// identity contains:
// - subject: Clerk user ID
// - name: Display name
// - email: Email address
// - pictureUrl: Avatar URL
```

### Existing Patterns (from template)

The template has basic auth. We need to extend with:
- Multi-tenancy (accountId scoping)
- Role-based access control
- Service authentication

---

## 3. High-level Design

### Auth Flow (User Requests)

```
1. User makes request → ClerkProvider adds JWT
2. Convex receives request → ctx.auth.getUserIdentity()
3. Auth guard verifies identity → Returns user info
4. Tenancy guard checks membership → Returns account context
5. Function executes with verified context
```

### Auth Flow (Service Requests)

```
1. Runtime service makes request → Adds service token header
2. Convex action receives request → Validates service token
3. Service guard extracts accountId → Returns service context
4. Function executes with service context
```

### Helper Function Hierarchy

```
requireAuth()
    └── Returns: { userId, userName, userEmail, userAvatarUrl }

requireAccountMember(accountId)
    └── Calls: requireAuth()
    └── Checks: memberships table
    └── Returns: { ...authContext, accountId, membership }

requireAccountAdmin(accountId)
    └── Calls: requireAccountMember()
    └── Checks: role in ["owner", "admin"]
    └── Returns: { ...memberContext }

requireServiceAuth()
    └── Validates: service token
    └── Returns: { accountId, serviceId }
```

---

## 4. File & Module Changes

### Files to Create

| Path | Purpose |
|------|---------|
| `packages/backend/convex/lib/auth.ts` | Auth guard helpers |
| `packages/backend/convex/lib/service-auth.ts` | Service auth helpers |
| `packages/backend/convex/accounts.ts` | Account CRUD |
| `packages/backend/convex/memberships.ts` | Membership CRUD |

### Files to Modify

| Path | Changes |
|------|---------|
| `packages/backend/convex/activities.ts` | Add activity logging helper (stub for Module 08) |

---

## 5. Step-by-Step Tasks

### Step 1: Create Auth Guard Helpers

Create `packages/backend/convex/lib/auth.ts`:

```typescript
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

/**
 * Context returned by requireAuth().
 * Contains verified user information from Clerk.
 */
export interface AuthContext {
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string;
}

/**
 * Context returned by requireAccountMember().
 * Extends AuthContext with account and membership info.
 */
export interface AccountMemberContext extends AuthContext {
  accountId: Id<"accounts">;
  membership: Doc<"memberships">;
  account: Doc<"accounts">;
}

/**
 * Verify the user is authenticated.
 * Throws if no valid identity is present.
 * 
 * @param ctx - Convex query or mutation context
 * @returns Authenticated user context
 * @throws Error if user is not authenticated
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<AuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  
  if (!identity) {
    throw new Error("Unauthenticated: No valid identity found");
  }
  
  return {
    userId: identity.subject,
    userName: identity.name ?? "Unknown",
    userEmail: identity.email ?? "",
    userAvatarUrl: identity.pictureUrl,
  };
}

/**
 * Verify the user is a member of the specified account.
 * Throws if user is not authenticated or not a member.
 * 
 * @param ctx - Convex query or mutation context
 * @param accountId - Account to check membership for
 * @returns Account member context with membership details
 * @throws Error if user is not authenticated or not a member
 */
export async function requireAccountMember(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<AccountMemberContext> {
  const authContext = await requireAuth(ctx);
  
  // Fetch account
  const account = await ctx.db.get(accountId);
  if (!account) {
    throw new Error("Not found: Account does not exist");
  }
  
  // Check membership
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_account_user", (q) => 
      q.eq("accountId", accountId).eq("userId", authContext.userId)
    )
    .unique();
  
  if (!membership) {
    throw new Error("Forbidden: User is not a member of this account");
  }
  
  return {
    ...authContext,
    accountId,
    membership,
    account,
  };
}

/**
 * Verify the user is an admin or owner of the specified account.
 * Throws if user is not authenticated, not a member, or insufficient role.
 * 
 * @param ctx - Convex query or mutation context
 * @param accountId - Account to check admin status for
 * @returns Account member context (guaranteed admin or owner role)
 * @throws Error if user lacks admin privileges
 */
export async function requireAccountAdmin(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<AccountMemberContext> {
  const memberContext = await requireAccountMember(ctx, accountId);
  
  if (memberContext.membership.role !== "owner" && 
      memberContext.membership.role !== "admin") {
    throw new Error("Forbidden: Admin or owner role required");
  }
  
  return memberContext;
}

/**
 * Verify the user is the owner of the specified account.
 * Throws if user is not the owner.
 * 
 * @param ctx - Convex query or mutation context
 * @param accountId - Account to check ownership for
 * @returns Account member context (guaranteed owner role)
 * @throws Error if user is not the owner
 */
export async function requireAccountOwner(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<AccountMemberContext> {
  const memberContext = await requireAccountMember(ctx, accountId);
  
  if (memberContext.membership.role !== "owner") {
    throw new Error("Forbidden: Owner role required");
  }
  
  return memberContext;
}

/**
 * Get the user's membership for an account, if it exists.
 * Does not throw if not a member - returns null instead.
 * 
 * @param ctx - Convex query or mutation context
 * @param accountId - Account to check
 * @returns Membership if exists, null otherwise
 */
export async function getAccountMembership(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<Doc<"memberships"> | null> {
  const authContext = await requireAuth(ctx);
  
  return ctx.db
    .query("memberships")
    .withIndex("by_account_user", (q) => 
      q.eq("accountId", accountId).eq("userId", authContext.userId)
    )
    .unique();
}
```

### Step 2: Create Service Auth Helpers

Create `packages/backend/convex/lib/service-auth.ts`:

```typescript
import { ActionCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Context returned by service authentication.
 * Used by runtime service calls.
 */
export interface ServiceContext {
  accountId: Id<"accounts">;
  serviceId: string;
}

/**
 * Service token format:
 * mc_service_{accountId}_{randomSecret}
 * 
 * In production, this would be:
 * - Generated when runtime is provisioned
 * - Stored encrypted in Convex
 * - Validated against stored value
 */

/**
 * Verify service authentication from action context.
 * Service tokens are passed via custom header.
 * 
 * NOTE: This is a simplified implementation.
 * Production should use proper secret validation.
 * 
 * @param ctx - Convex action context
 * @param serviceToken - Service token from request header
 * @returns Service context with accountId
 * @throws Error if token is invalid
 */
export async function requireServiceAuth(
  serviceToken: string
): Promise<ServiceContext> {
  // Validate token format
  if (!serviceToken.startsWith("mc_service_")) {
    throw new Error("Invalid service token format");
  }
  
  const parts = serviceToken.split("_");
  if (parts.length < 4) {
    throw new Error("Invalid service token structure");
  }
  
  // Extract accountId (part after "mc_service_")
  // Format: mc_service_{accountId}_{secret}
  const accountIdStr = parts[2];
  
  // In production: validate the secret portion against stored value
  // For now, we trust the token format
  
  return {
    accountId: accountIdStr as Id<"accounts">,
    serviceId: serviceToken,
  };
}

/**
 * Generate a service token for an account.
 * Called when provisioning a runtime server.
 * 
 * @param accountId - Account to generate token for
 * @returns Generated service token
 */
export function generateServiceToken(accountId: Id<"accounts">): string {
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `mc_service_${accountId}_${randomPart}`;
}
```

### Step 3: Create Account Management

Create `packages/backend/convex/accounts.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireAccountMember, requireAccountOwner } from "./lib/auth";

/**
 * Create a new account.
 * The creating user becomes the owner.
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const authContext = await requireAuth(ctx);
    
    // Check slug uniqueness
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    
    if (existing) {
      throw new Error("Conflict: Account slug already exists");
    }
    
    // Create account
    const accountId = await ctx.db.insert("accounts", {
      name: args.name,
      slug: args.slug,
      plan: "free",
      runtimeStatus: "offline",
      createdAt: Date.now(),
    });
    
    // Create owner membership
    await ctx.db.insert("memberships", {
      accountId,
      userId: authContext.userId,
      userName: authContext.userName,
      userEmail: authContext.userEmail,
      userAvatarUrl: authContext.userAvatarUrl,
      role: "owner",
      joinedAt: Date.now(),
    });
    
    // TODO: Log activity (implemented in Module 08)
    
    return accountId;
  },
});

/**
 * Get account by ID.
 * Requires membership.
 */
export const get = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { account } = await requireAccountMember(ctx, args.accountId);
    return account;
  },
});

/**
 * Get account by slug.
 * Requires membership.
 */
export const getBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const authContext = await requireAuth(ctx);
    
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    
    if (!account) {
      return null;
    }
    
    // Check membership
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) => 
        q.eq("accountId", account._id).eq("userId", authContext.userId)
      )
      .unique();
    
    if (!membership) {
      return null;
    }
    
    return account;
  },
});

/**
 * List all accounts the current user is a member of.
 */
export const listMyAccounts = query({
  args: {},
  handler: async (ctx) => {
    const authContext = await requireAuth(ctx);
    
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", authContext.userId))
      .collect();
    
    const accounts = await Promise.all(
      memberships.map(async (m) => {
        const account = await ctx.db.get(m.accountId);
        return account ? { ...account, role: m.role } : null;
      })
    );
    
    return accounts.filter(Boolean);
  },
});

/**
 * Update account details.
 * Requires admin role.
 */
export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) {
      updates.name = args.name;
    }
    
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.accountId, updates);
    }
    
    // TODO: Log activity
    
    return args.accountId;
  },
});

/**
 * Update account runtime status.
 * Internal use only (called by service functions).
 * 
 * Includes version tracking for OpenClaw and runtime service.
 */
export const updateRuntimeStatus = mutation({
  args: {
    accountId: v.id("accounts"),
    status: v.union(
      v.literal("provisioning"),
      v.literal("online"),
      v.literal("degraded"),
      v.literal("offline"),
      v.literal("error")
    ),
    config: v.optional(v.object({
      dropletId: v.string(),
      ipAddress: v.string(),
      region: v.optional(v.string()),
      lastHealthCheck: v.optional(v.number()),
      // Version tracking (v1)
      openclawVersion: v.optional(v.string()),
      runtimeServiceVersion: v.optional(v.string()),
      lastUpgradeAt: v.optional(v.number()),
      lastUpgradeStatus: v.optional(v.union(
        v.literal("success"),
        v.literal("failed"),
        v.literal("rolled_back")
      )),
    })),
  },
  handler: async (ctx, args) => {
    // This mutation is for internal/service use
    // In production, add service auth check here
    
    const updates: Record<string, unknown> = {
      runtimeStatus: args.status,
    };
    
    if (args.config) {
      updates.runtimeConfig = args.config;
    }
    
    await ctx.db.patch(args.accountId, updates);
    
    // TODO: Log activity
    
    return args.accountId;
  },
});

/**
 * Delete account.
 * Requires owner role.
 * WARNING: This deletes all account data.
 */
export const remove = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountOwner(ctx, args.accountId);
    
    // Delete all related data
    // Order matters for foreign key-like relationships
    
    // 1. Delete notifications
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const n of notifications) {
      await ctx.db.delete(n._id);
    }
    
    // 2. Delete subscriptions
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.accountId as any)) // Will need proper query
      .collect();
    // Note: subscriptions need to be queried by account, add that index if needed
    
    // 3. Delete activities
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const a of activities) {
      await ctx.db.delete(a._id);
    }
    
    // 4. Delete messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const m of messages) {
      await ctx.db.delete(m._id);
    }
    
    // 5. Delete documents
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const d of documents) {
      await ctx.db.delete(d._id);
    }
    
    // 6. Delete tasks
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const t of tasks) {
      await ctx.db.delete(t._id);
    }
    
    // 7. Delete agents
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const a of agents) {
      await ctx.db.delete(a._id);
    }
    
    // 8. Delete memberships
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const m of memberships) {
      await ctx.db.delete(m._id);
    }
    
    // 9. Delete account
    await ctx.db.delete(args.accountId);
    
    return true;
  },
});

// Import for requireAccountAdmin
import { requireAccountAdmin } from "./lib/auth";
```

### Step 4: Create Membership Management

Create `packages/backend/convex/memberships.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { 
  requireAuth, 
  requireAccountMember, 
  requireAccountAdmin,
  requireAccountOwner 
} from "./lib/auth";
import { memberRoleValidator } from "./lib/validators";

/**
 * List all members of an account.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    return ctx.db
      .query("memberships")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

/**
 * Get current user's membership for an account.
 */
export const getMyMembership = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const authContext = await requireAuth(ctx);
    
    return ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) => 
        q.eq("accountId", args.accountId).eq("userId", authContext.userId)
      )
      .unique();
  },
});

/**
 * Invite a user to an account.
 * Requires admin role.
 * 
 * Note: In a full implementation, this would send an email invitation.
 * For now, it directly creates the membership (assumes user exists in Clerk).
 */
export const invite = mutation({
  args: {
    accountId: v.id("accounts"),
    userId: v.string(),
    userName: v.string(),
    userEmail: v.string(),
    userAvatarUrl: v.optional(v.string()),
    role: memberRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    
    // Check if user is already a member
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) => 
        q.eq("accountId", args.accountId).eq("userId", args.userId)
      )
      .unique();
    
    if (existing) {
      throw new Error("Conflict: User is already a member");
    }
    
    // Cannot invite as owner (only one owner per account)
    if (args.role === "owner") {
      throw new Error("Forbidden: Cannot invite as owner");
    }
    
    const membershipId = await ctx.db.insert("memberships", {
      accountId: args.accountId,
      userId: args.userId,
      userName: args.userName,
      userEmail: args.userEmail,
      userAvatarUrl: args.userAvatarUrl,
      role: args.role,
      joinedAt: Date.now(),
    });
    
    // TODO: Log activity
    
    return membershipId;
  },
});

/**
 * Update a member's role.
 * Requires admin role.
 * Cannot change owner's role.
 */
export const updateRole = mutation({
  args: {
    accountId: v.id("accounts"),
    membershipId: v.id("memberships"),
    role: memberRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new Error("Not found: Membership does not exist");
    }
    
    if (membership.accountId !== args.accountId) {
      throw new Error("Forbidden: Membership belongs to different account");
    }
    
    // Cannot change owner's role
    if (membership.role === "owner") {
      throw new Error("Forbidden: Cannot change owner's role");
    }
    
    // Cannot promote to owner
    if (args.role === "owner") {
      throw new Error("Forbidden: Cannot promote to owner");
    }
    
    await ctx.db.patch(args.membershipId, { role: args.role });
    
    // TODO: Log activity
    
    return args.membershipId;
  },
});

/**
 * Remove a member from an account.
 * Requires admin role.
 * Cannot remove owner.
 */
export const remove = mutation({
  args: {
    accountId: v.id("accounts"),
    membershipId: v.id("memberships"),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new Error("Not found: Membership does not exist");
    }
    
    if (membership.accountId !== args.accountId) {
      throw new Error("Forbidden: Membership belongs to different account");
    }
    
    // Cannot remove owner
    if (membership.role === "owner") {
      throw new Error("Forbidden: Cannot remove owner");
    }
    
    await ctx.db.delete(args.membershipId);
    
    // TODO: Log activity
    
    return true;
  },
});

/**
 * Leave an account.
 * User can leave any account they're a member of.
 * Owner cannot leave (must transfer ownership first).
 */
export const leave = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireAccountMember(ctx, args.accountId);
    
    // Owner cannot leave
    if (membership.role === "owner") {
      throw new Error("Forbidden: Owner cannot leave account. Transfer ownership first.");
    }
    
    await ctx.db.delete(membership._id);
    
    // TODO: Log activity
    
    return true;
  },
});

/**
 * Transfer ownership to another member.
 * Requires current owner role.
 */
export const transferOwnership = mutation({
  args: {
    accountId: v.id("accounts"),
    newOwnerMembershipId: v.id("memberships"),
  },
  handler: async (ctx, args) => {
    const { membership: currentOwnerMembership } = await requireAccountOwner(ctx, args.accountId);
    
    const newOwnerMembership = await ctx.db.get(args.newOwnerMembershipId);
    if (!newOwnerMembership) {
      throw new Error("Not found: Target membership does not exist");
    }
    
    if (newOwnerMembership.accountId !== args.accountId) {
      throw new Error("Forbidden: Target membership belongs to different account");
    }
    
    // Swap roles
    await ctx.db.patch(currentOwnerMembership._id, { role: "admin" });
    await ctx.db.patch(args.newOwnerMembershipId, { role: "owner" });
    
    // TODO: Log activity
    
    return true;
  },
});
```

### Step 5: Create Activity Logging Stub

Create `packages/backend/convex/lib/activity.ts` (stub for Module 08):

```typescript
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Activity logging helper.
 * Full implementation in Module 08.
 * 
 * This stub allows other modules to call logActivity without errors.
 */

export type ActivityType =
  | "task_created"
  | "task_updated"
  | "task_status_changed"
  | "message_created"
  | "document_created"
  | "document_updated"
  | "agent_status_changed"
  | "runtime_status_changed"
  | "member_added"
  | "member_removed";

export interface LogActivityParams {
  ctx: MutationCtx;
  accountId: Id<"accounts">;
  type: ActivityType;
  actorType: "user" | "agent" | "system";
  actorId: string;
  actorName: string;
  targetType: "task" | "message" | "document" | "agent" | "account" | "membership";
  targetId: string;
  targetName?: string;
  meta?: Record<string, unknown>;
}

/**
 * Log an activity.
 * Stub implementation - full implementation in Module 08.
 */
export async function logActivity(params: LogActivityParams): Promise<Id<"activities">> {
  // Stub: Insert activity record directly
  // Module 08 will add proper implementation with notifications
  
  return params.ctx.db.insert("activities", {
    accountId: params.accountId,
    type: params.type,
    actorType: params.actorType,
    actorId: params.actorId,
    actorName: params.actorName,
    targetType: params.targetType,
    targetId: params.targetId,
    targetName: params.targetName,
    meta: params.meta,
    createdAt: Date.now(),
  });
}
```

### Step 6: Update Exports

Ensure all new files are properly exported and imports work.

### Step 7: Verify Types and Build

```bash
# Restart Convex to pick up new files
cd packages/backend
npx convex dev --once

# Run type check
npm run typecheck
```

### Step 8: Commit Changes

```bash
git add .
git commit -m "feat(auth): implement authentication and tenancy infrastructure

- Add requireAuth, requireAccountMember, requireAccountAdmin helpers
- Add service auth helpers for runtime
- Implement account CRUD mutations
- Implement membership CRUD mutations
- Add activity logging stub
"
```

---

## 6. Edge Cases & Risks

### Edge Cases

| Case | Handling |
|------|----------|
| User not authenticated | `requireAuth()` throws "Unauthenticated" |
| User not member | `requireAccountMember()` throws "Forbidden" |
| Account not found | Throw "Not found" |
| Duplicate slug | `create` mutation throws "Conflict" |
| Remove owner | Block with "Cannot remove owner" |
| Self-demotion | Allowed (user can leave) |

### Security Considerations

- **Token validation**: Service tokens should be properly validated in production
- **Rate limiting**: Consider adding rate limits to invite mutation
- **Audit trail**: All membership changes must be logged

---

## 7. Testing Strategy

### Unit Tests (to add later)

- `requireAuth` with valid/invalid identity
- `requireAccountMember` with member/non-member
- Role hierarchy checks

### Manual Verification

- [ ] Create account (via Convex dashboard or UI)
- [ ] List accounts returns correct accounts
- [ ] Invite member works
- [ ] Update role works
- [ ] Remove member works
- [ ] Cannot remove owner

---

## 8. Rollout / Migration

Not applicable for initial implementation.

---

## 9. TODO Checklist

### Auth Helpers

- [ ] Create `lib/auth.ts` with `requireAuth`
- [ ] Add `requireAccountMember`
- [ ] Add `requireAccountAdmin`
- [ ] Add `requireAccountOwner`

### Service Auth

- [ ] Create `lib/service-auth.ts`
- [ ] Implement `requireServiceAuth`
- [ ] Implement `generateServiceToken`

### Accounts

- [ ] Create `accounts.ts`
- [ ] Implement `create` mutation
- [ ] Implement `get` query
- [ ] Implement `getBySlug` query
- [ ] Implement `listMyAccounts` query
- [ ] Implement `update` mutation
- [ ] Implement `updateRuntimeStatus` mutation
- [ ] Implement `remove` mutation

### Memberships

- [ ] Create `memberships.ts`
- [ ] Implement `list` query
- [ ] Implement `getMyMembership` query
- [ ] Implement `invite` mutation
- [ ] Implement `updateRole` mutation
- [ ] Implement `remove` mutation
- [ ] Implement `leave` mutation
- [ ] Implement `transferOwnership` mutation

### Activity Stub

- [ ] Create `lib/activity.ts` stub

### Verification

- [ ] `npx convex dev` succeeds
- [ ] `npm run typecheck` passes
- [ ] Test create account via dashboard
- [ ] Commit changes

---

## Completion Criteria

This module is complete when:

1. All auth guard helpers implemented and typed
2. Account CRUD mutations work
3. Membership CRUD mutations work
4. Service auth helpers exist (for runtime use)
5. Activity logging stub exists
6. Type check passes
7. Git commit made
