# Module 07: Messages & Mentions

> Implement task thread messaging with mention parsing.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Mentions + notifications concept (Section 9)
2. **`docs/mission-control-cursor-core-instructions.md`** — Mention invariants (Section 4.5)
3. **`.cursor/rules/05-convex.mdc`** — Convex patterns for queries/mutations

**Key understanding:**
- Mentions generate notifications: `@user` or `@agent` or `@all`
- Auto-subscribe participants to threads
- Notifications queued for delivery to agents via runtime
- At-least-once delivery (idempotent)

---

## 1. Context & Goal

We are implementing the messaging system for Mission Control task threads. Messages enable collaboration through threaded discussions with @mention support.

**What we're building:**
- Message CRUD: Create, read, update, delete messages in task threads
- Mention parsing: Parse @user and @agent mentions from content
- Thread subscriptions: Auto-subscribe participants
- Service functions: Allow agents to post messages

**Key constraints:**
- Messages belong to tasks (task threads)
- Mentions generate notifications (Module 08)
- Participants auto-subscribe to threads
- Support both user and agent authors

---

## 2. Codebase Research Summary

### Files to Reference

- `packages/backend/convex/schema.ts` - Messages, subscriptions tables
- `packages/backend/convex/lib/auth.ts` - Auth guards
- `packages/backend/convex/tasks.ts` - Task module

### Message Schema Reference

```typescript
messages: defineTable({
  accountId: v.id("accounts"),
  taskId: v.id("tasks"),
  authorType: recipientTypeValidator,
  authorId: v.string(),
  content: v.string(),
  mentions: v.array(v.object({
    type: recipientTypeValidator,
    id: v.string(),
    name: v.string(),
  })),
  attachments: v.optional(v.array(attachmentValidator)),
  createdAt: v.number(),
  editedAt: v.optional(v.number()),
})
```

### Mention Format

```
@username → Mention user
@agentname → Mention agent
@all → Mention all account members/agents
```

---

## 3. High-level Design

### Message Flow

```
1. User submits message → Parse mentions
2. Create message record → Create notifications for mentions
3. Auto-subscribe author → Auto-subscribe mentioned entities
4. Notify thread subscribers → Create notifications
5. Real-time update → UI reflects new message
```

### Mention Parsing Logic

```typescript
// Pattern: @word or @"multi word"
const mentionPattern = /@(\w+|"[^"]+"|all)/g;

// Resolution:
// 1. Check if matches user name/email
// 2. Check if matches agent slug/name
// 3. "all" = everyone in account
```

---

## 4. File & Module Changes

### Files to Create

| Path | Purpose |
|------|---------|
| `packages/backend/convex/messages.ts` | Message CRUD |
| `packages/backend/convex/subscriptions.ts` | Subscription management |
| `packages/backend/convex/lib/mentions.ts` | Mention parsing |
| `packages/backend/convex/service/messages.ts` | Agent message functions |

---

## 5. Step-by-Step Tasks

### Step 1: Create Mention Parser

Create `packages/backend/convex/lib/mentions.ts`:

```typescript
import { QueryCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";

/**
 * Parsed mention with resolved entity.
 */
export interface ParsedMention {
  type: "user" | "agent";
  id: string;
  name: string;
}

/**
 * Parse mentions from message content.
 * Supports: @username, @"full name", @agentslug, @all
 * 
 * @param content - Message content
 * @returns Array of mention strings (unresolved)
 */
export function extractMentionStrings(content: string): string[] {
  const pattern = /@(\w+|"[^"]+")/g;
  const matches = content.match(pattern) || [];
  
  return matches.map(m => {
    // Remove @ prefix
    let mention = m.slice(1);
    // Remove quotes if present
    if (mention.startsWith('"') && mention.endsWith('"')) {
      mention = mention.slice(1, -1);
    }
    return mention.toLowerCase();
  });
}

/**
 * Check if content contains @all mention.
 */
export function hasAllMention(content: string): boolean {
  return /@all\b/i.test(content);
}

/**
 * Resolve mention strings to actual users and agents.
 * 
 * @param ctx - Convex context
 * @param accountId - Account to search within
 * @param mentionStrings - Array of mention strings to resolve
 * @returns Array of resolved mentions
 */
export async function resolveMentions(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  mentionStrings: string[]
): Promise<ParsedMention[]> {
  if (mentionStrings.length === 0) {
    return [];
  }
  
  const mentions: ParsedMention[] = [];
  const resolved = new Set<string>();
  
  // Fetch all members and agents for the account
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  
  const agents = await ctx.db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  
  for (const mentionStr of mentionStrings) {
    // Skip if already resolved
    if (resolved.has(mentionStr)) continue;
    
    // Try to match user by name (case-insensitive)
    const matchedMember = memberships.find(m => 
      m.userName.toLowerCase() === mentionStr ||
      m.userEmail.toLowerCase().split('@')[0] === mentionStr
    );
    
    if (matchedMember) {
      mentions.push({
        type: "user",
        id: matchedMember.userId,
        name: matchedMember.userName,
      });
      resolved.add(mentionStr);
      continue;
    }
    
    // Try to match agent by slug or name
    const matchedAgent = agents.find(a => 
      a.slug.toLowerCase() === mentionStr ||
      a.name.toLowerCase() === mentionStr
    );
    
    if (matchedAgent) {
      mentions.push({
        type: "agent",
        id: matchedAgent._id,
        name: matchedAgent.name,
      });
      resolved.add(mentionStr);
    }
    
    // If no match, skip (don't include unresolved mentions)
  }
  
  return mentions;
}

/**
 * Get all mentionable entities for @all.
 */
export async function getAllMentions(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  excludeAuthorId?: string
): Promise<ParsedMention[]> {
  const mentions: ParsedMention[] = [];
  
  // Get all members
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  
  for (const m of memberships) {
    if (m.userId !== excludeAuthorId) {
      mentions.push({
        type: "user",
        id: m.userId,
        name: m.userName,
      });
    }
  }
  
  // Get all agents
  const agents = await ctx.db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  
  for (const a of agents) {
    if (a._id !== excludeAuthorId) {
      mentions.push({
        type: "agent",
        id: a._id,
        name: a.name,
      });
    }
  }
  
  return mentions;
}
```

### Step 2: Create Subscriptions Module

Create `packages/backend/convex/subscriptions.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { recipientTypeValidator } from "./lib/validators";
import { Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";

/**
 * Get subscriptions for a task.
 */
export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return [];
    }
    
    await requireAccountMember(ctx, task.accountId);
    
    return ctx.db
      .query("subscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

/**
 * Check if entity is subscribed to a task.
 */
export const isSubscribed = query({
  args: {
    taskId: v.id("tasks"),
    subscriberType: recipientTypeValidator,
    subscriberId: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_task_subscriber", (q) => 
        q.eq("taskId", args.taskId)
         .eq("subscriberType", args.subscriberType)
         .eq("subscriberId", args.subscriberId)
      )
      .unique();
    
    return subscription !== null;
  },
});

/**
 * Subscribe to a task thread.
 */
export const subscribe = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    const { userId } = await requireAccountMember(ctx, task.accountId);
    
    // Check if already subscribed
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_task_subscriber", (q) => 
        q.eq("taskId", args.taskId)
         .eq("subscriberType", "user")
         .eq("subscriberId", userId)
      )
      .unique();
    
    if (existing) {
      return existing._id;
    }
    
    return ctx.db.insert("subscriptions", {
      accountId: task.accountId,
      taskId: args.taskId,
      subscriberType: "user",
      subscriberId: userId,
      subscribedAt: Date.now(),
    });
  },
});

/**
 * Unsubscribe from a task thread.
 */
export const unsubscribe = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    const { userId } = await requireAccountMember(ctx, task.accountId);
    
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_task_subscriber", (q) => 
        q.eq("taskId", args.taskId)
         .eq("subscriberType", "user")
         .eq("subscriberId", userId)
      )
      .unique();
    
    if (subscription) {
      await ctx.db.delete(subscription._id);
    }
    
    return true;
  },
});

/**
 * Internal: Auto-subscribe an entity to a task.
 * Used when posting messages or being mentioned.
 */
export const autoSubscribe = internalMutation({
  args: {
    accountId: v.id("accounts"),
    taskId: v.id("tasks"),
    subscriberType: recipientTypeValidator,
    subscriberId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if already subscribed
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_task_subscriber", (q) => 
        q.eq("taskId", args.taskId)
         .eq("subscriberType", args.subscriberType)
         .eq("subscriberId", args.subscriberId)
      )
      .unique();
    
    if (existing) {
      return existing._id;
    }
    
    return ctx.db.insert("subscriptions", {
      accountId: args.accountId,
      taskId: args.taskId,
      subscriberType: args.subscriberType,
      subscriberId: args.subscriberId,
      subscribedAt: Date.now(),
    });
  },
});

/**
 * Helper: Ensure entity is subscribed (for use in mutations).
 */
export async function ensureSubscribed(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  subscriberType: "user" | "agent",
  subscriberId: string
): Promise<void> {
  const existing = await ctx.db
    .query("subscriptions")
    .withIndex("by_task_subscriber", (q) => 
      q.eq("taskId", taskId)
       .eq("subscriberType", subscriberType)
       .eq("subscriberId", subscriberId)
    )
    .unique();
  
  if (!existing) {
    await ctx.db.insert("subscriptions", {
      accountId,
      taskId,
      subscriberType,
      subscriberId,
      subscribedAt: Date.now(),
    });
  }
}
```

### Step 3: Create Messages Module

Create `packages/backend/convex/messages.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { recipientTypeValidator, mentionValidator, attachmentValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";
import { 
  extractMentionStrings, 
  resolveMentions, 
  hasAllMention,
  getAllMentions,
  ParsedMention 
} from "./lib/mentions";
import { ensureSubscribed } from "./subscriptions";

/**
 * List messages for a task thread.
 */
export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return [];
    }
    
    await requireAccountMember(ctx, task.accountId);
    
    let messages = await ctx.db
      .query("messages")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    // Sort by created (oldest first for chat)
    messages.sort((a, b) => a.createdAt - b.createdAt);
    
    // Apply limit (from end for most recent)
    if (args.limit && messages.length > args.limit) {
      messages = messages.slice(-args.limit);
    }
    
    return messages;
  },
});

/**
 * Get a single message.
 */
export const get = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      return null;
    }
    
    await requireAccountMember(ctx, message.accountId);
    return message;
  },
});

/**
 * Create a new message in a task thread.
 */
export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    const { userId, userName, accountId } = await requireAccountMember(ctx, task.accountId);
    
    // Parse and resolve mentions
    let mentions: ParsedMention[] = [];
    
    if (hasAllMention(args.content)) {
      // @all - mention everyone except author
      mentions = await getAllMentions(ctx, accountId, userId);
    } else {
      // Resolve specific mentions
      const mentionStrings = extractMentionStrings(args.content);
      mentions = await resolveMentions(ctx, accountId, mentionStrings);
    }
    
    // Create message
    const messageId = await ctx.db.insert("messages", {
      accountId,
      taskId: args.taskId,
      authorType: "user",
      authorId: userId,
      content: args.content,
      mentions,
      attachments: args.attachments,
      createdAt: Date.now(),
    });
    
    // Auto-subscribe author to thread
    await ensureSubscribed(ctx, accountId, args.taskId, "user", userId);
    
    // Auto-subscribe mentioned entities
    for (const mention of mentions) {
      await ensureSubscribed(ctx, accountId, args.taskId, mention.type, mention.id);
    }
    
    // Log activity
    await logActivity({
      ctx,
      accountId,
      type: "message_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "message",
      targetId: messageId,
      targetName: task.title,
      meta: { 
        taskId: args.taskId,
        mentionCount: mentions.length,
        hasAttachments: !!args.attachments?.length,
      },
    });
    
    // TODO: Create notifications for mentions (Module 08)
    // TODO: Create notifications for thread subscribers (Module 08)
    
    return messageId;
  },
});

/**
 * Update a message (edit).
 */
export const update = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Not found: Message does not exist");
    }
    
    const { userId } = await requireAccountMember(ctx, message.accountId);
    
    // Only author can edit
    if (message.authorType !== "user" || message.authorId !== userId) {
      throw new Error("Forbidden: Only author can edit message");
    }
    
    // Re-parse mentions from new content
    let mentions: ParsedMention[] = [];
    
    if (hasAllMention(args.content)) {
      mentions = await getAllMentions(ctx, message.accountId, userId);
    } else {
      const mentionStrings = extractMentionStrings(args.content);
      mentions = await resolveMentions(ctx, message.accountId, mentionStrings);
    }
    
    await ctx.db.patch(args.messageId, {
      content: args.content,
      mentions,
      editedAt: Date.now(),
    });
    
    return args.messageId;
  },
});

/**
 * Delete a message.
 */
export const remove = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Not found: Message does not exist");
    }
    
    const { userId } = await requireAccountMember(ctx, message.accountId);
    
    // Only author can delete (or admin - could add later)
    if (message.authorType !== "user" || message.authorId !== userId) {
      throw new Error("Forbidden: Only author can delete message");
    }
    
    await ctx.db.delete(args.messageId);
    
    return true;
  },
});

/**
 * Get message count for a task.
 */
export const getCount = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    return messages.length;
  },
});
```

### Step 4: Create Service Messages Module

Create `packages/backend/convex/service/messages.ts`:

```typescript
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { attachmentValidator } from "../lib/validators";
import { logActivity } from "../lib/activity";
import { ensureSubscribed } from "../subscriptions";
import { 
  extractMentionStrings, 
  resolveMentions, 
  hasAllMention,
  getAllMentions,
} from "../lib/mentions";

/**
 * Create a message from an agent.
 * Called by runtime when agent posts to a thread.
 */
export const createFromAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    // Get agent info
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    // Get task info
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    // Verify same account
    if (task.accountId !== agent.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }
    
    // Parse and resolve mentions
    let mentions;
    
    if (hasAllMention(args.content)) {
      mentions = await getAllMentions(ctx, agent.accountId, args.agentId);
    } else {
      const mentionStrings = extractMentionStrings(args.content);
      mentions = await resolveMentions(ctx, agent.accountId, mentionStrings);
    }
    
    // Create message
    const messageId = await ctx.db.insert("messages", {
      accountId: agent.accountId,
      taskId: args.taskId,
      authorType: "agent",
      authorId: args.agentId,
      content: args.content,
      mentions,
      attachments: args.attachments,
      createdAt: Date.now(),
    });
    
    // Auto-subscribe agent to thread
    await ensureSubscribed(ctx, agent.accountId, args.taskId, "agent", args.agentId);
    
    // Auto-subscribe mentioned entities
    for (const mention of mentions) {
      await ensureSubscribed(ctx, agent.accountId, args.taskId, mention.type, mention.id);
    }
    
    // Log activity
    await logActivity({
      ctx,
      accountId: agent.accountId,
      type: "message_created",
      actorType: "agent",
      actorId: args.agentId,
      actorName: agent.name,
      targetType: "message",
      targetId: messageId,
      targetName: task.title,
      meta: { 
        taskId: args.taskId,
        mentionCount: mentions.length,
      },
    });
    
    // TODO: Create notifications (Module 08)
    
    return messageId;
  },
});
```

### Step 5: Update Validators

Add missing validators to `packages/backend/convex/lib/validators.ts`:

```typescript
// Add to existing validators.ts

/** Mention object validator */
export const mentionValidator = v.object({
  type: recipientTypeValidator,
  id: v.string(),
  name: v.string(),
});

/** Attachment object validator */
export const attachmentValidator = v.object({
  name: v.string(),
  url: v.string(),
  type: v.string(),
  size: v.number(),
});
```

### Step 6: Verify Build

```bash
cd packages/backend
npx convex dev --once
npm run typecheck
```

### Step 7: Commit Changes

```bash
git add .
git commit -m "feat(messages): implement task thread messaging with mentions

- Add message CRUD operations
- Implement mention parsing (@user, @agent, @all)
- Add auto-subscription to threads
- Add service function for agent messages
- Add subscription management
"
```

---

## 6. Edge Cases & Risks

### Edge Cases

| Case | Handling |
|------|----------|
| Unresolved mention | Skip, don't create notification |
| @all mention | Mention everyone except author |
| Edit with new mentions | Re-parse and update mentions array |
| Delete own message | Allowed |
| Delete others' message | Forbidden (admin could be added) |

---

## 7. Testing Strategy

### Manual Verification

- [ ] Create message in task thread
- [ ] Mention resolves correctly (user)
- [ ] Mention resolves correctly (agent)
- [ ] @all mentions everyone
- [ ] Author auto-subscribed
- [ ] Mentioned entities auto-subscribed
- [ ] Edit updates mentions
- [ ] Delete removes message

---

## 9. TODO Checklist

### Mentions

- [ ] Create `lib/mentions.ts`
- [ ] Implement `extractMentionStrings`
- [ ] Implement `resolveMentions`
- [ ] Implement `hasAllMention`
- [ ] Implement `getAllMentions`

### Subscriptions

- [ ] Create `subscriptions.ts`
- [ ] Implement `listByTask`
- [ ] Implement `subscribe`
- [ ] Implement `unsubscribe`
- [ ] Implement `autoSubscribe`

### Messages

- [ ] Create `messages.ts`
- [ ] Implement `listByTask`
- [ ] Implement `get`
- [ ] Implement `create`
- [ ] Implement `update`
- [ ] Implement `remove`
- [ ] Implement `getCount`

### Service

- [ ] Create `service/messages.ts`
- [ ] Implement `createFromAgent`

### Verification

- [ ] Type check passes
- [ ] Test mention parsing
- [ ] Test message CRUD
- [ ] Commit changes

---

## Completion Criteria

This module is complete when:

1. Message CRUD works
2. Mention parsing resolves users and agents
3. Auto-subscription works
4. Agent messaging via service works
5. Type check passes
6. Git commit made
