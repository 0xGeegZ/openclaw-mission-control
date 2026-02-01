# Module 05: Agents Module

> Implement AI agent management for OpenClaw integration.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Agent concepts: SOUL, sessions, heartbeat (Sections 3, 6-8)
2. **`docs/mission-control-cursor-core-instructions.md`** — Agent SOUL template (Section 8.3)
3. **`.cursor/rules/05-convex.mdc`** — Convex patterns

**Key understanding:**
- Each agent maps to one OpenClaw session
- Session key format: `agent:{slug}:{accountId}`
- SOUL file defines agent personality and operating procedures
- Heartbeat interval determines wake-up frequency
- Status: online, busy, idle, offline, error

---

## 1. Context & Goal

We are implementing the AI agent management system for Mission Control. Agents are the core of the system - they are AI entities that run on OpenClaw sessions and collaborate on tasks.

**What we're building:**
- Agent CRUD: Create, read, update, delete agents
- Status management: Track agent online/offline/busy states
- Heartbeat tracking: Record when agents last checked in
- Session key generation: Create OpenClaw session keys
- Agent roster queries: List agents with their current status

**Key constraints:**
- Each agent maps to one OpenClaw session
- Session keys must be unique and follow format: `agent:{slug}:{accountId}`
- Agents are scoped to accounts (multi-tenant)
- Status changes logged to activities
- SOUL content stored for agent personality

---

## 2. Codebase Research Summary

### Files to Reference

- `packages/backend/convex/schema.ts` - Agents table definition
- `packages/shared/src/types/index.ts` - AgentStatus type
- `packages/backend/convex/lib/auth.ts` - Auth guards (from Module 03)

### Agent Schema Reference

```typescript
agents: defineTable({
  accountId: v.id("accounts"),
  name: v.string(),
  slug: v.string(),
  role: v.string(),
  description: v.optional(v.string()),
  sessionKey: v.string(),
  status: agentStatusValidator,
  currentTaskId: v.optional(v.id("tasks")),
  lastHeartbeat: v.optional(v.number()),
  heartbeatInterval: v.number(),
  avatarUrl: v.optional(v.string()),
  soulContent: v.optional(v.string()),
  createdAt: v.number(),
})
```

### OpenClaw Session Integration

```
Session Key Format: agent:{slug}:{accountId}
Examples:
  - agent:jarvis:acc_123abc
  - agent:vision:acc_123abc
  - agent:product-analyst:acc_456def
```

---

## 3. High-level Design

### Agent Lifecycle

```
1. Admin creates agent → Agent record in Convex
2. Runtime boots → OpenClaw session created with sessionKey
3. Agent heartbeat → Updates lastHeartbeat, status
4. Agent works on task → currentTaskId updated
5. Agent completes/idles → Status changes
```

### Status State Machine

```
           ┌─────────────┐
           │   offline   │◄──────────────────┐
           └──────┬──────┘                   │
                  │ runtime boots            │ runtime stops
                  ▼                          │
           ┌─────────────┐                   │
      ┌───►│   online    │◄───┐              │
      │    └──────┬──────┘    │              │
      │           │           │              │
      │ heartbeat │ picks task│ completes   │
      │    ok     │           │  task       │
      │           ▼           │              │
      │    ┌─────────────┐    │              │
      │    │    busy     │────┘              │
      │    └─────────────┘                   │
      │                                      │
      │    ┌─────────────┐                   │
      └────│    idle     │───────────────────┘
           └─────────────┘     (timeout)
           
           ┌─────────────┐
           │   error     │ (any state can transition to error)
           └─────────────┘
```

---

## 4. File & Module Changes

### Files to Create

| Path | Purpose |
|------|---------|
| `packages/backend/convex/agents.ts` | Agent CRUD and status management |
| `packages/backend/convex/service/agents.ts` | Service-only functions for runtime |

---

## 5. Step-by-Step Tasks

### Step 1: Create Agents Module

Create `packages/backend/convex/agents.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember, requireAccountAdmin } from "./lib/auth";
import { agentStatusValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";
import { Id } from "./_generated/dataModel";

/**
 * Generate a session key for an agent.
 * Format: agent:{slug}:{accountId}
 */
function generateSessionKey(slug: string, accountId: Id<"accounts">): string {
  return `agent:${slug}:${accountId}`;
}

/**
 * List all agents for an account.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    return ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

/**
 * List agents filtered by status.
 */
export const listByStatus = query({
  args: {
    accountId: v.id("accounts"),
    status: agentStatusValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    return ctx.db
      .query("agents")
      .withIndex("by_account_status", (q) => 
        q.eq("accountId", args.accountId).eq("status", args.status)
      )
      .collect();
  },
});

/**
 * Get a single agent by ID.
 */
export const get = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      return null;
    }
    
    await requireAccountMember(ctx, agent.accountId);
    return agent;
  },
});

/**
 * Get an agent by slug within an account.
 */
export const getBySlug = query({
  args: {
    accountId: v.id("accounts"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    return ctx.db
      .query("agents")
      .withIndex("by_account_slug", (q) => 
        q.eq("accountId", args.accountId).eq("slug", args.slug)
      )
      .unique();
  },
});

/**
 * Get an agent by session key.
 * Used by runtime to look up agent from OpenClaw session.
 */
export const getBySessionKey = query({
  args: {
    sessionKey: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_session_key", (q) => q.eq("sessionKey", args.sessionKey))
      .unique();
    
    if (!agent) {
      return null;
    }
    
    // Note: This query may be called by service without user auth
    // The session key itself acts as authentication
    
    return agent;
  },
});

/**
 * Get agent roster with current task info.
 * Returns agents with their current task details.
 */
export const getRoster = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    
    // Fetch current task for each agent
    const roster = await Promise.all(
      agents.map(async (agent) => {
        let currentTask = null;
        if (agent.currentTaskId) {
          currentTask = await ctx.db.get(agent.currentTaskId);
        }
        
        return {
          ...agent,
          currentTask: currentTask ? {
            _id: currentTask._id,
            title: currentTask.title,
            status: currentTask.status,
          } : null,
        };
      })
    );
    
    // Sort: online first, then by name
    roster.sort((a, b) => {
      const statusOrder = { online: 0, busy: 1, idle: 2, offline: 3, error: 4 };
      const aOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 5;
      const bOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 5;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      return a.name.localeCompare(b.name);
    });
    
    return roster;
  },
});

/**
 * Create a new agent.
 * Requires admin role.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.string(),
    slug: v.string(),
    role: v.string(),
    description: v.optional(v.string()),
    heartbeatInterval: v.optional(v.number()),
    avatarUrl: v.optional(v.string()),
    soulContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);
    
    // Check slug uniqueness within account
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_account_slug", (q) => 
        q.eq("accountId", args.accountId).eq("slug", args.slug)
      )
      .unique();
    
    if (existing) {
      throw new Error("Conflict: Agent slug already exists in this account");
    }
    
    // Generate session key
    const sessionKey = generateSessionKey(args.slug, args.accountId);
    
    const agentId = await ctx.db.insert("agents", {
      accountId: args.accountId,
      name: args.name,
      slug: args.slug,
      role: args.role,
      description: args.description,
      sessionKey,
      status: "offline",
      heartbeatInterval: args.heartbeatInterval ?? 15, // Default 15 minutes
      avatarUrl: args.avatarUrl,
      soulContent: args.soulContent,
      createdAt: Date.now(),
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "agent_status_changed",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "agent",
      targetId: agentId,
      targetName: args.name,
      meta: { action: "created", status: "offline" },
    });
    
    return agentId;
  },
});

/**
 * Update agent details.
 * Requires admin role.
 */
export const update = mutation({
  args: {
    agentId: v.id("agents"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    description: v.optional(v.string()),
    heartbeatInterval: v.optional(v.number()),
    avatarUrl: v.optional(v.string()),
    soulContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    const { userId, userName } = await requireAccountAdmin(ctx, agent.accountId);
    
    const updates: Record<string, unknown> = {};
    
    if (args.name !== undefined) updates.name = args.name;
    if (args.role !== undefined) updates.role = args.role;
    if (args.description !== undefined) updates.description = args.description;
    if (args.heartbeatInterval !== undefined) updates.heartbeatInterval = args.heartbeatInterval;
    if (args.avatarUrl !== undefined) updates.avatarUrl = args.avatarUrl;
    if (args.soulContent !== undefined) updates.soulContent = args.soulContent;
    
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.agentId, updates);
    }
    
    // Log activity
    await logActivity({
      ctx,
      accountId: agent.accountId,
      type: "agent_status_changed",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "agent",
      targetId: args.agentId,
      targetName: args.name ?? agent.name,
      meta: { action: "updated", fields: Object.keys(updates) },
    });
    
    return args.agentId;
  },
});

/**
 * Update agent status.
 * Can be called by users (admin) or service.
 */
export const updateStatus = mutation({
  args: {
    agentId: v.id("agents"),
    status: agentStatusValidator,
    currentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    // For now, allow status updates from authenticated users
    // Service calls will use a separate endpoint
    const { userId, userName } = await requireAccountMember(ctx, agent.accountId);
    
    const oldStatus = agent.status;
    
    await ctx.db.patch(args.agentId, {
      status: args.status,
      currentTaskId: args.currentTaskId,
      lastHeartbeat: Date.now(),
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: agent.accountId,
      type: "agent_status_changed",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "agent",
      targetId: args.agentId,
      targetName: agent.name,
      meta: { oldStatus, newStatus: args.status },
    });
    
    return args.agentId;
  },
});

/**
 * Delete an agent.
 * Requires admin role.
 */
export const remove = mutation({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    await requireAccountAdmin(ctx, agent.accountId);
    
    // Remove agent from any task assignments
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", agent.accountId))
      .collect();
    
    for (const task of tasks) {
      if (task.assignedAgentIds.includes(args.agentId)) {
        await ctx.db.patch(task._id, {
          assignedAgentIds: task.assignedAgentIds.filter(id => id !== args.agentId),
        });
      }
    }
    
    // Delete notifications for this agent
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) => 
        q.eq("accountId", agent.accountId)
         .eq("recipientType", "agent")
         .eq("recipientId", args.agentId)
      )
      .collect();
    
    for (const notification of notifications) {
      await ctx.db.delete(notification._id);
    }
    
    // Delete subscriptions for this agent
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_subscriber", (q) => 
        q.eq("subscriberType", "agent").eq("subscriberId", args.agentId)
      )
      .collect();
    
    for (const subscription of subscriptions) {
      await ctx.db.delete(subscription._id);
    }
    
    // Delete the agent
    await ctx.db.delete(args.agentId);
    
    return true;
  },
});

/**
 * Get SOUL content for an agent.
 * Returns the agent's personality/operating instructions.
 */
export const getSoul = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      return null;
    }
    
    await requireAccountMember(ctx, agent.accountId);
    
    return {
      name: agent.name,
      role: agent.role,
      soulContent: agent.soulContent ?? generateDefaultSoul(agent.name, agent.role),
    };
  },
});

/**
 * Generate default SOUL content for an agent.
 */
function generateDefaultSoul(name: string, role: string): string {
  return `# SOUL — ${name}

Role: ${role}
Level: specialist

## Mission
Execute assigned tasks with precision and provide clear, actionable updates.

## Personality constraints
- Be concise and focused
- Provide evidence for claims
- Ask questions only when blocked
- Update task status promptly

## Default operating procedure
- On heartbeat: check for assigned tasks and mentions
- Post structured updates in task threads
- Create documents for deliverables

## Quality checks (must pass)
- Evidence attached when making claims
- Clear next step identified
- Task state is correct

## What you never do
- Invent facts without sources
- Change decisions without documentation
- Leave tasks in ambiguous states
`;
}
```

### Step 2: Create Service Agents Module

Create `packages/backend/convex/service/agents.ts`:

```typescript
import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { agentStatusValidator } from "../lib/validators";
import { logActivity } from "../lib/activity";

/**
 * Service-only agent functions.
 * These are called by the runtime service, not users.
 * 
 * NOTE: In production, these should validate service auth token.
 * For now, they're internal mutations that can be called by actions.
 */

/**
 * Update agent heartbeat.
 * Called by runtime when agent completes heartbeat cycle.
 */
export const upsertHeartbeat = internalMutation({
  args: {
    agentId: v.id("agents"),
    status: agentStatusValidator,
    currentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    const oldStatus = agent.status;
    const now = Date.now();
    
    await ctx.db.patch(args.agentId, {
      status: args.status,
      currentTaskId: args.currentTaskId,
      lastHeartbeat: now,
    });
    
    // Log activity if status changed
    if (oldStatus !== args.status) {
      await logActivity({
        ctx,
        accountId: agent.accountId,
        type: "agent_status_changed",
        actorType: "agent",
        actorId: args.agentId,
        actorName: agent.name,
        targetType: "agent",
        targetId: args.agentId,
        targetName: agent.name,
        meta: { oldStatus, newStatus: args.status, heartbeat: true },
      });
    }
    
    return { success: true, timestamp: now };
  },
});

/**
 * Mark all agents for an account as offline.
 * Called when runtime shuts down.
 */
export const markAllOffline = internalMutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    
    for (const agent of agents) {
      if (agent.status !== "offline") {
        await ctx.db.patch(agent._id, {
          status: "offline",
          currentTaskId: undefined,
        });
        
        await logActivity({
          ctx,
          accountId: args.accountId,
          type: "agent_status_changed",
          actorType: "system",
          actorId: "system",
          actorName: "System",
          targetType: "agent",
          targetId: agent._id,
          targetName: agent.name,
          meta: { oldStatus: agent.status, newStatus: "offline", reason: "runtime_shutdown" },
        });
      }
    }
    
    return { success: true, count: agents.length };
  },
});

/**
 * Get agents that need heartbeat check.
 * Returns agents that haven't had a heartbeat in their expected interval.
 */
export const getStaleAgents = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account_status", (q) => 
        q.eq("accountId", args.accountId).eq("status", "online")
      )
      .collect();
    
    const now = Date.now();
    const staleAgents = agents.filter((agent) => {
      if (!agent.lastHeartbeat) return true;
      
      const intervalMs = agent.heartbeatInterval * 60 * 1000; // Convert to ms
      const expectedBy = agent.lastHeartbeat + intervalMs + (60 * 1000); // Add 1 min grace
      
      return now > expectedBy;
    });
    
    return staleAgents;
  },
});
```

### Step 3: Verify Build

```bash
cd packages/backend
npx convex dev --once
npm run typecheck
```

### Step 4: Commit Changes

```bash
git add .
git commit -m "feat(agents): implement AI agent management

- Add agent CRUD operations
- Implement status management
- Add session key generation for OpenClaw
- Add heartbeat tracking
- Add service functions for runtime
- Include SOUL content management
"
```

---

## 6. Edge Cases & Risks

### Edge Cases

| Case | Handling |
|------|----------|
| Duplicate agent slug | Throw "Conflict" error |
| Delete agent with tasks | Remove from task assignments |
| Agent heartbeat timeout | Mark as stale for runtime to handle |
| Missing SOUL content | Generate default |

### OpenClaw Integration Notes

- Session keys must exactly match OpenClaw session names
- Runtime is responsible for creating OpenClaw sessions
- Convex stores agent metadata, OpenClaw stores conversation history

---

## 7. Testing Strategy

### Manual Verification

- [ ] Create agent with all fields
- [ ] List agents returns correct data
- [ ] Get roster includes current task
- [ ] Update status works
- [ ] Delete agent removes from assignments
- [ ] SOUL content retrieval works

---

## 8. Skills Module (NEW)

Create `packages/backend/convex/skills.ts` for managing reusable skills:

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember, requireAccountAdmin } from "./lib/auth";

/**
 * Skill category validator.
 */
const skillCategoryValidator = v.union(
  v.literal("mcp_server"),
  v.literal("tool"),
  v.literal("integration"),
  v.literal("custom")
);

/**
 * List all skills for an account.
 * Any member can view skills.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    category: v.optional(skillCategoryValidator),
    enabledOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    let skills;
    
    if (args.category) {
      skills = await ctx.db
        .query("skills")
        .withIndex("by_account_category", (q) => 
          q.eq("accountId", args.accountId).eq("category", args.category)
        )
        .collect();
    } else {
      skills = await ctx.db
        .query("skills")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .collect();
    }
    
    if (args.enabledOnly) {
      skills = skills.filter(s => s.isEnabled);
    }
    
    return skills;
  },
});

/**
 * Get a single skill by ID.
 */
export const get = query({
  args: {
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) return null;
    
    await requireAccountMember(ctx, skill.accountId);
    return skill;
  },
});

/**
 * Create a new skill.
 * Requires admin role.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.string(),
    slug: v.string(),
    category: skillCategoryValidator,
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    config: v.object({
      serverUrl: v.optional(v.string()),
      authType: v.optional(v.union(
        v.literal("none"),
        v.literal("api_key"),
        v.literal("oauth")
      )),
      credentialRef: v.optional(v.string()),
      toolParams: v.optional(v.any()),
      rateLimit: v.optional(v.number()),
      requiresApproval: v.optional(v.boolean()),
    }),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    
    // Check slug uniqueness
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_account_slug", (q) => 
        q.eq("accountId", args.accountId).eq("slug", args.slug)
      )
      .unique();
    
    if (existing) {
      throw new Error("Conflict: Skill slug already exists");
    }
    
    const now = Date.now();
    
    return ctx.db.insert("skills", {
      accountId: args.accountId,
      name: args.name,
      slug: args.slug,
      category: args.category,
      description: args.description,
      icon: args.icon,
      config: args.config,
      isEnabled: args.isEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a skill.
 * Requires admin role.
 */
export const update = mutation({
  args: {
    skillId: v.id("skills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    config: v.optional(v.object({
      serverUrl: v.optional(v.string()),
      authType: v.optional(v.union(
        v.literal("none"),
        v.literal("api_key"),
        v.literal("oauth")
      )),
      credentialRef: v.optional(v.string()),
      toolParams: v.optional(v.any()),
      rateLimit: v.optional(v.number()),
      requiresApproval: v.optional(v.boolean()),
    })),
    isEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      throw new Error("Not found: Skill does not exist");
    }
    
    await requireAccountAdmin(ctx, skill.accountId);
    
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.config !== undefined) updates.config = args.config;
    if (args.isEnabled !== undefined) updates.isEnabled = args.isEnabled;
    
    await ctx.db.patch(args.skillId, updates);
    return args.skillId;
  },
});

/**
 * Delete a skill.
 * Requires admin role.
 * Will remove from all agents using it.
 */
export const remove = mutation({
  args: {
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) return true;
    
    await requireAccountAdmin(ctx, skill.accountId);
    
    // Remove skill from all agents that have it
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", skill.accountId))
      .collect();
    
    for (const agent of agents) {
      if (agent.openclawConfig?.skillIds?.includes(args.skillId)) {
        const newSkillIds = agent.openclawConfig.skillIds.filter(
          id => id !== args.skillId
        );
        await ctx.db.patch(agent._id, {
          openclawConfig: {
            ...agent.openclawConfig,
            skillIds: newSkillIds,
          },
        });
      }
    }
    
    await ctx.db.delete(args.skillId);
    return true;
  },
});

/**
 * Toggle skill enabled status.
 * Requires admin role.
 */
export const toggleEnabled = mutation({
  args: {
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      throw new Error("Not found: Skill does not exist");
    }
    
    await requireAccountAdmin(ctx, skill.accountId);
    
    await ctx.db.patch(args.skillId, {
      isEnabled: !skill.isEnabled,
      updatedAt: Date.now(),
    });
    
    return !skill.isEnabled;
  },
});
```

---

## 9. OpenClaw Config Management

Add these mutations to `packages/backend/convex/agents.ts` for managing agent OpenClaw configuration:

```typescript
/**
 * Update agent OpenClaw configuration.
 * Requires admin role.
 */
export const updateOpenclawConfig = mutation({
  args: {
    agentId: v.id("agents"),
    config: v.object({
      model: v.string(),
      temperature: v.number(),
      maxTokens: v.optional(v.number()),
      systemPromptPrefix: v.optional(v.string()),
      skillIds: v.array(v.id("skills")),
      contextConfig: v.optional(v.object({
        maxHistoryMessages: v.number(),
        includeTaskContext: v.boolean(),
        includeTeamContext: v.boolean(),
        customContextSources: v.optional(v.array(v.string())),
      })),
      rateLimits: v.optional(v.object({
        requestsPerMinute: v.number(),
        tokensPerDay: v.optional(v.number()),
      })),
      behaviorFlags: v.optional(v.object({
        canCreateTasks: v.boolean(),
        canModifyTaskStatus: v.boolean(),
        canCreateDocuments: v.boolean(),
        canMentionAgents: v.boolean(),
        requiresApprovalForActions: v.optional(v.array(v.string())),
      })),
    }),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    const { userId, userName } = await requireAccountAdmin(ctx, agent.accountId);
    
    // Validate all skillIds exist and belong to same account
    for (const skillId of args.config.skillIds) {
      const skill = await ctx.db.get(skillId);
      if (!skill || skill.accountId !== agent.accountId) {
        throw new Error(`Invalid skill: ${skillId}`);
      }
      if (!skill.isEnabled) {
        throw new Error(`Skill is disabled: ${skill.name}`);
      }
    }
    
    await ctx.db.patch(args.agentId, {
      openclawConfig: args.config,
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: agent.accountId,
      type: "agent_status_changed",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "agent",
      targetId: args.agentId,
      targetName: agent.name,
      meta: { action: "config_updated" },
    });
    
    return args.agentId;
  },
});

/**
 * Get agent with resolved skills.
 * Returns agent with full skill objects instead of just IDs.
 */
export const getWithSkills = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) return null;
    
    await requireAccountMember(ctx, agent.accountId);
    
    // Resolve skill IDs to full skill objects
    let skills: any[] = [];
    if (agent.openclawConfig?.skillIds) {
      skills = await Promise.all(
        agent.openclawConfig.skillIds.map(id => ctx.db.get(id))
      );
      skills = skills.filter(Boolean);
    }
    
    return {
      ...agent,
      resolvedSkills: skills,
    };
  },
});

/**
 * Assign/remove skills from agent.
 * Requires admin role.
 */
export const updateSkills = mutation({
  args: {
    agentId: v.id("agents"),
    skillIds: v.array(v.id("skills")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    await requireAccountAdmin(ctx, agent.accountId);
    
    // Validate all skills
    for (const skillId of args.skillIds) {
      const skill = await ctx.db.get(skillId);
      if (!skill || skill.accountId !== agent.accountId) {
        throw new Error(`Invalid skill: ${skillId}`);
      }
    }
    
    const currentConfig = agent.openclawConfig ?? {
      model: "claude-sonnet-4-20250514",
      temperature: 0.7,
      skillIds: [],
    };
    
    await ctx.db.patch(args.agentId, {
      openclawConfig: {
        ...currentConfig,
        skillIds: args.skillIds,
      },
    });
    
    return args.agentId;
  },
});

/**
 * Get default OpenClaw config for new agents.
 */
export function getDefaultOpenclawConfig(accountId: Id<"accounts">) {
  return {
    model: "claude-sonnet-4-20250514",
    temperature: 0.7,
    maxTokens: 4096,
    skillIds: [],
    contextConfig: {
      maxHistoryMessages: 50,
      includeTaskContext: true,
      includeTeamContext: true,
    },
    behaviorFlags: {
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: true,
      canMentionAgents: true,
    },
  };
}
```

---

## 10. Rollout / Migration

Not applicable for initial implementation.

---

## 11. TODO Checklist

### Main Module

- [ ] Create `agents.ts`
- [ ] Implement `list` query
- [ ] Implement `listByStatus` query
- [ ] Implement `get` query
- [ ] Implement `getBySlug` query
- [ ] Implement `getBySessionKey` query
- [ ] Implement `getRoster` query
- [ ] Implement `create` mutation
- [ ] Implement `update` mutation
- [ ] Implement `updateStatus` mutation
- [ ] Implement `remove` mutation
- [ ] Implement `getSoul` query
- [ ] Implement `updateOpenclawConfig` mutation
- [ ] Implement `getWithSkills` query
- [ ] Implement `updateSkills` mutation

### Skills Module

- [ ] Create `skills.ts`
- [ ] Implement `list` query
- [ ] Implement `get` query
- [ ] Implement `create` mutation
- [ ] Implement `update` mutation
- [ ] Implement `remove` mutation
- [ ] Implement `toggleEnabled` mutation

### Service Module

- [ ] Create `service/agents.ts`
- [ ] Implement `upsertHeartbeat`
- [ ] Implement `markAllOffline`
- [ ] Implement `getStaleAgents`

### Verification

- [ ] Type check passes
- [ ] Create test agent
- [ ] Verify session key format
- [ ] Create test skill
- [ ] Assign skill to agent
- [ ] Commit changes

---

## Completion Criteria

This module is complete when:

1. All agent queries and mutations implemented
2. Skills CRUD operations work
3. Service functions exist for runtime
4. Session key generation works
5. SOUL content management works
6. OpenClaw config management works
7. Type check passes
8. Git commit made
