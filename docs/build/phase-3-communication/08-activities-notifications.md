# Module 08: Activities & Notifications

> Implement activity feed and notification system.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Mentions + notifications concept (Section 9)
2. **`docs/mission-control-cursor-core-instructions.md`** — Activity logging invariants (L1)
3. **`.cursor/rules/05-convex.mdc`** — Convex patterns

**Key understanding:**
- Activities = append-only audit trail (never edited)
- Notifications have two states: `deliveredAt` (for agents) and `readAt` (for users)
- At-least-once delivery semantics (idempotent marking)
- Thread subscribers auto-notified on new messages
- Runtime polls for undelivered agent notifications

---

## 1. Context & Goal

We are implementing the activity feed and notification system for Mission Control. Activities provide an audit trail and live feed. Notifications deliver mentions and updates to users and agents.

**What we're building:**
- Activity queries: List activities for feed, filter by type
- Activity logging: Complete implementation (upgrade from stub)
- Notification CRUD: Create, list, mark delivered/read
- Notification creation: Auto-create from mentions and subscriptions
- Service functions: For runtime notification delivery

**Key constraints:**
- Activities are append-only (audit trail)
- Notifications have delivery state (for agents) and read state (for users)
- At-least-once delivery semantics
- Thread subscribers get notified on new messages

---

## 2. Codebase Research Summary

### Files to Reference

- `packages/backend/convex/schema.ts` - Activities, notifications tables
- `packages/backend/convex/lib/activity.ts` - Activity stub to upgrade
- `packages/backend/convex/messages.ts` - Needs notification creation

### Activity Schema Reference

```typescript
activities: defineTable({
  accountId: v.id("accounts"),
  type: activityTypeValidator,
  actorType: v.union("user", "agent", "system"),
  actorId: v.string(),
  actorName: v.string(),
  targetType: v.union("task", "message", "document", "agent", "account", "membership"),
  targetId: v.string(),
  targetName: v.optional(v.string()),
  meta: v.optional(v.any()),
  createdAt: v.number(),
})
```

### Notification Schema Reference

```typescript
notifications: defineTable({
  accountId: v.id("accounts"),
  type: notificationTypeValidator,
  recipientType: recipientTypeValidator,
  recipientId: v.string(),
  taskId: v.optional(v.id("tasks")),
  messageId: v.optional(v.id("messages")),
  title: v.string(),
  body: v.string(),
  deliveredAt: v.optional(v.number()),
  readAt: v.optional(v.number()),
  createdAt: v.number(),
})
```

---

## 3. High-level Design

### Activity Flow

```
Mutation occurs → logActivity() called → Activity inserted → Feed updates via subscription
```

### Notification Flow

```
Message created → Parse mentions → Create mention notifications
                → Get subscribers → Create thread_update notifications
                → Notifications queued for delivery

Runtime polls → Fetch undelivered agent notifications → Deliver to OpenClaw → Mark delivered
User views UI → Fetch unread notifications → Display → User clicks → Mark read
```

---

## 4. File & Module Changes

### Files to Create/Modify

| Path | Action | Purpose |
|------|--------|---------|
| `packages/backend/convex/activities.ts` | Create | Activity queries |
| `packages/backend/convex/notifications.ts` | Create | Notification CRUD |
| `packages/backend/convex/lib/activity.ts` | Upgrade | Full implementation |
| `packages/backend/convex/lib/notifications.ts` | Create | Notification creation helpers |
| `packages/backend/convex/service/notifications.ts` | Create | Service functions |

---

## 5. Step-by-Step Tasks

### Step 1: Create Activities Module

Create `packages/backend/convex/activities.ts`:

```typescript
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { activityTypeValidator } from "./lib/validators";

/**
 * List activities for an account (activity feed).
 * Returns most recent first.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
    beforeTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    let activities = await ctx.db
      .query("activities")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .collect();
    
    // Filter by timestamp if provided (for pagination)
    if (args.beforeTimestamp) {
      activities = activities.filter(a => a.createdAt < args.beforeTimestamp);
    }
    
    // Apply limit
    const limit = args.limit ?? 50;
    activities = activities.slice(0, limit);
    
    return activities;
  },
});

/**
 * List activities for a specific target (e.g., all activities for a task).
 */
export const listByTarget = query({
  args: {
    targetType: v.union(
      v.literal("task"),
      v.literal("message"),
      v.literal("document"),
      v.literal("agent"),
      v.literal("account"),
      v.literal("membership")
    ),
    targetId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_target", (q) => 
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .order("desc")
      .collect();
    
    // Verify user has access to at least one activity's account
    if (activities.length > 0) {
      await requireAccountMember(ctx, activities[0].accountId);
    }
    
    const limit = args.limit ?? 20;
    return activities.slice(0, limit);
  },
});

/**
 * List activities by type.
 */
export const listByType = query({
  args: {
    accountId: v.id("accounts"),
    type: activityTypeValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .collect();
    
    const filtered = activities.filter(a => a.type === args.type);
    
    const limit = args.limit ?? 50;
    return filtered.slice(0, limit);
  },
});

/**
 * Get activity count for an account (for badges).
 */
export const getRecentCount = query({
  args: {
    accountId: v.id("accounts"),
    sinceTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .collect();
    
    return activities.filter(a => a.createdAt >= args.sinceTimestamp).length;
  },
});
```

### Step 2: Upgrade Activity Logging Helper

Update `packages/backend/convex/lib/activity.ts`:

```typescript
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Activity type definitions.
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

/**
 * Parameters for logging an activity.
 */
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
 * Log an activity to the activity feed.
 * This is the full implementation (not a stub).
 * 
 * @param params - Activity parameters
 * @returns The created activity ID
 */
export async function logActivity(params: LogActivityParams): Promise<Id<"activities">> {
  const { ctx, accountId, type, actorType, actorId, actorName, targetType, targetId, targetName, meta } = params;
  
  return ctx.db.insert("activities", {
    accountId,
    type,
    actorType,
    actorId,
    actorName,
    targetType,
    targetId,
    targetName,
    meta,
    createdAt: Date.now(),
  });
}

/**
 * Get human-readable description for an activity.
 */
export function getActivityDescription(
  type: ActivityType,
  actorName: string,
  targetName?: string
): string {
  const target = targetName ?? "an item";
  
  switch (type) {
    case "task_created":
      return `${actorName} created task "${target}"`;
    case "task_updated":
      return `${actorName} updated task "${target}"`;
    case "task_status_changed":
      return `${actorName} changed status of "${target}"`;
    case "message_created":
      return `${actorName} commented on "${target}"`;
    case "document_created":
      return `${actorName} created document "${target}"`;
    case "document_updated":
      return `${actorName} updated document "${target}"`;
    case "agent_status_changed":
      return `${actorName} status changed`;
    case "runtime_status_changed":
      return `Runtime status changed`;
    case "member_added":
      return `${actorName} joined the account`;
    case "member_removed":
      return `${actorName} left the account`;
    default:
      return `${actorName} performed an action`;
  }
}
```

### Step 3: Create Notification Creation Helpers

Create `packages/backend/convex/lib/notifications.ts`:

```typescript
import { MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { ParsedMention } from "./mentions";

/**
 * Notification type.
 */
export type NotificationType = 
  | "mention"
  | "assignment"
  | "thread_update"
  | "status_change";

/**
 * Create notifications for mentions.
 * Called after a message is created with mentions.
 */
export async function createMentionNotifications(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  messageId: Id<"messages">,
  mentions: ParsedMention[],
  authorName: string,
  taskTitle: string
): Promise<Id<"notifications">[]> {
  const notificationIds: Id<"notifications">[] = [];
  
  for (const mention of mentions) {
    const notificationId = await ctx.db.insert("notifications", {
      accountId,
      type: "mention",
      recipientType: mention.type,
      recipientId: mention.id,
      taskId,
      messageId,
      title: `${authorName} mentioned you`,
      body: `You were mentioned in task "${taskTitle}"`,
      createdAt: Date.now(),
    });
    
    notificationIds.push(notificationId);
  }
  
  return notificationIds;
}

/**
 * Create notifications for thread subscribers.
 * Called after a message is created, excluding author and already-mentioned.
 */
export async function createThreadNotifications(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  messageId: Id<"messages">,
  authorType: "user" | "agent",
  authorId: string,
  authorName: string,
  taskTitle: string,
  mentionedIds: Set<string>
): Promise<Id<"notifications">[]> {
  // Get all subscribers
  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  
  const notificationIds: Id<"notifications">[] = [];
  
  for (const subscription of subscriptions) {
    // Skip author
    if (subscription.subscriberType === authorType && subscription.subscriberId === authorId) {
      continue;
    }
    
    // Skip already mentioned (they got a mention notification)
    if (mentionedIds.has(subscription.subscriberId)) {
      continue;
    }
    
    const notificationId = await ctx.db.insert("notifications", {
      accountId,
      type: "thread_update",
      recipientType: subscription.subscriberType,
      recipientId: subscription.subscriberId,
      taskId,
      messageId,
      title: `${authorName} replied`,
      body: `New message in task "${taskTitle}"`,
      createdAt: Date.now(),
    });
    
    notificationIds.push(notificationId);
  }
  
  return notificationIds;
}

/**
 * Create notification for task assignment.
 */
export async function createAssignmentNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  recipientType: "user" | "agent",
  recipientId: string,
  assignerName: string,
  taskTitle: string
): Promise<Id<"notifications">> {
  return ctx.db.insert("notifications", {
    accountId,
    type: "assignment",
    recipientType,
    recipientId,
    taskId,
    title: `${assignerName} assigned you`,
    body: `You were assigned to task "${taskTitle}"`,
    createdAt: Date.now(),
  });
}

/**
 * Create notification for status change.
 */
export async function createStatusChangeNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  recipientType: "user" | "agent",
  recipientId: string,
  changerName: string,
  taskTitle: string,
  newStatus: string
): Promise<Id<"notifications">> {
  return ctx.db.insert("notifications", {
    accountId,
    type: "status_change",
    recipientType,
    recipientId,
    taskId,
    title: `Task status changed to ${newStatus}`,
    body: `${changerName} changed "${taskTitle}" to ${newStatus}`,
    createdAt: Date.now(),
  });
}
```

### Step 4: Create Notifications Module

Create `packages/backend/convex/notifications.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { recipientTypeValidator, notificationTypeValidator } from "./lib/validators";

/**
 * List notifications for the current user.
 */
export const listMine = query({
  args: {
    accountId: v.id("accounts"),
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccountMember(ctx, args.accountId);
    
    let notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) => 
        q.eq("accountId", args.accountId)
         .eq("recipientType", "user")
         .eq("recipientId", userId)
      )
      .order("desc")
      .collect();
    
    // Filter unread only if requested
    if (args.unreadOnly) {
      notifications = notifications.filter(n => !n.readAt);
    }
    
    // Apply limit
    const limit = args.limit ?? 50;
    return notifications.slice(0, limit);
  },
});

/**
 * Get unread notification count for the current user.
 */
export const getUnreadCount = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccountMember(ctx, args.accountId);
    
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) => 
        q.eq("accountId", args.accountId)
         .eq("recipientType", "user")
         .eq("recipientId", userId)
      )
      .collect();
    
    return notifications.filter(n => !n.readAt).length;
  },
});

/**
 * Mark a notification as read.
 */
export const markRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Not found: Notification does not exist");
    }
    
    const { userId } = await requireAccountMember(ctx, notification.accountId);
    
    // Verify ownership
    if (notification.recipientType !== "user" || notification.recipientId !== userId) {
      throw new Error("Forbidden: Cannot mark others' notifications");
    }
    
    if (!notification.readAt) {
      await ctx.db.patch(args.notificationId, {
        readAt: Date.now(),
      });
    }
    
    return true;
  },
});

/**
 * Mark all notifications as read.
 */
export const markAllRead = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccountMember(ctx, args.accountId);
    
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) => 
        q.eq("accountId", args.accountId)
         .eq("recipientType", "user")
         .eq("recipientId", userId)
      )
      .collect();
    
    const now = Date.now();
    let count = 0;
    
    for (const notification of notifications) {
      if (!notification.readAt) {
        await ctx.db.patch(notification._id, { readAt: now });
        count++;
      }
    }
    
    return { count };
  },
});

/**
 * Delete a notification.
 */
export const remove = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      return true; // Already deleted
    }
    
    const { userId } = await requireAccountMember(ctx, notification.accountId);
    
    // Verify ownership
    if (notification.recipientType !== "user" || notification.recipientId !== userId) {
      throw new Error("Forbidden: Cannot delete others' notifications");
    }
    
    await ctx.db.delete(args.notificationId);
    return true;
  },
});
```

### Step 5: Create Service Notifications Module

Create `packages/backend/convex/service/notifications.ts`:

```typescript
import { v } from "convex/values";
import { query, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * List undelivered agent notifications for an account.
 * Used by runtime to fetch notifications to deliver.
 */
export const listUndeliveredForAccount = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Note: This is called by service, no user auth
    // Service auth should be validated at action level
    
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_undelivered", (q) => 
        q.eq("accountId", args.accountId)
         .eq("recipientType", "agent")
         .eq("deliveredAt", undefined)
      )
      .collect();
    
    // Sort by created (oldest first for FIFO)
    notifications.sort((a, b) => a.createdAt - b.createdAt);
    
    const limit = args.limit ?? 100;
    return notifications.slice(0, limit);
  },
});

/**
 * Mark a notification as delivered.
 * Called by runtime after successfully delivering to OpenClaw.
 */
export const markDelivered = internalMutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Not found: Notification does not exist");
    }
    
    if (!notification.deliveredAt) {
      await ctx.db.patch(args.notificationId, {
        deliveredAt: Date.now(),
      });
    }
    
    return true;
  },
});

/**
 * Get notification details for delivery.
 * Returns full context needed to deliver to agent.
 */
export const getForDelivery = query({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      return null;
    }
    
    // Get agent details
    let agent = null;
    if (notification.recipientType === "agent") {
      agent = await ctx.db.get(notification.recipientId as Id<"agents">);
    }
    
    // Get task details if present
    let task = null;
    if (notification.taskId) {
      task = await ctx.db.get(notification.taskId);
    }
    
    // Get message details if present
    let message = null;
    if (notification.messageId) {
      message = await ctx.db.get(notification.messageId);
    }
    
    return {
      notification,
      agent,
      task,
      message,
    };
  },
});

/**
 * Batch mark notifications as delivered.
 */
export const batchMarkDelivered = internalMutation({
  args: {
    notificationIds: v.array(v.id("notifications")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    for (const notificationId of args.notificationIds) {
      const notification = await ctx.db.get(notificationId);
      if (notification && !notification.deliveredAt) {
        await ctx.db.patch(notificationId, { deliveredAt: now });
      }
    }
    
    return { count: args.notificationIds.length };
  },
});
```

### Step 6: Update Messages Module to Create Notifications

Add notification creation to `packages/backend/convex/messages.ts` in the `create` mutation:

```typescript
// After creating the message and auto-subscribing...

// Create mention notifications
import { createMentionNotifications, createThreadNotifications } from "./lib/notifications";

// In create mutation, after logActivity:
if (mentions.length > 0) {
  await createMentionNotifications(
    ctx,
    accountId,
    args.taskId,
    messageId,
    mentions,
    userName,
    task.title
  );
}

// Create thread update notifications
const mentionedIds = new Set(mentions.map(m => m.id));
await createThreadNotifications(
  ctx,
  accountId,
  args.taskId,
  messageId,
  "user",
  userId,
  userName,
  task.title,
  mentionedIds
);
```

### Step 7: Verify Build

```bash
cd packages/backend
npx convex dev --once
yarn typecheck
```

### Step 8: Commit Changes

```bash
git add .
git commit -m "feat(notifications): implement activity feed and notification system

- Add activity feed queries with filtering
- Upgrade activity logging helper
- Add notification CRUD operations
- Add notification creation helpers
- Add service functions for runtime delivery
- Integrate notifications with message creation
"
```

---

## 6. Edge Cases & Risks

### Edge Cases

| Case | Handling |
|------|----------|
| Already delivered | Don't re-deliver (idempotent) |
| Already read | Don't re-mark |
| Notification for deleted task | Include null task in response |
| Batch delivery failure | Mark successful ones, retry failed |

### At-Least-Once Delivery

- Runtime polls for undelivered
- After successful OpenClaw delivery, marks delivered
- If crash before marking, will retry (idempotent)

---

## 7. Testing Strategy

### Manual Verification

- [ ] Activity feed shows recent activities
- [ ] Filter by type works
- [ ] Notification created on mention
- [ ] Notification created for subscribers
- [ ] Mark read works
- [ ] Mark all read works
- [ ] Unread count accurate

---

## 9. TODO Checklist

### Activities

- [ ] Create `activities.ts`
- [ ] Implement `list`
- [ ] Implement `listByTarget`
- [ ] Implement `listByType`
- [ ] Implement `getRecentCount`

### Activity Helper

- [ ] Upgrade `lib/activity.ts` from stub
- [ ] Add `getActivityDescription`

### Notification Helpers

- [ ] Create `lib/notifications.ts`
- [ ] Implement `createMentionNotifications`
- [ ] Implement `createThreadNotifications`
- [ ] Implement `createAssignmentNotification`
- [ ] Implement `createStatusChangeNotification`

### Notifications Module

- [ ] Create `notifications.ts`
- [ ] Implement `listMine`
- [ ] Implement `getUnreadCount`
- [ ] Implement `markRead`
- [ ] Implement `markAllRead`
- [ ] Implement `remove`

### Service Module

- [ ] Create `service/notifications.ts`
- [ ] Implement `listUndeliveredForAccount`
- [ ] Implement `markDelivered`
- [ ] Implement `getForDelivery`
- [ ] Implement `batchMarkDelivered`

### Integration

- [ ] Update `messages.ts` to create notifications

### Verification

- [ ] Type check passes
- [ ] Test activity feed
- [ ] Test notifications
- [ ] Commit changes

---

## Completion Criteria

This module is complete when:

1. Activity feed works with filtering
2. Notifications created on mentions
3. Notifications created for subscribers
4. Service functions exist for runtime
5. Type check passes
6. Git commit made
