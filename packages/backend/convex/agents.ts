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

/**
 * Get default OpenClaw config for new agents.
 */
function getDefaultOpenclawConfig() {
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
      openclawConfig: getDefaultOpenclawConfig(),
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

    const account = await ctx.db.get(agent.accountId);
    const settings = account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined;
    if (settings?.orchestratorAgentId === args.agentId) {
      const currentSettings = account?.settings ?? {};
      await ctx.db.patch(agent.accountId, {
        settings: { ...currentSettings, orchestratorAgentId: undefined },
      });
    }

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
    
    const currentConfig = agent.openclawConfig ?? getDefaultOpenclawConfig();
    
    await ctx.db.patch(args.agentId, {
      openclawConfig: {
        ...currentConfig,
        skillIds: args.skillIds,
      },
    });
    
    return args.agentId;
  },
});
