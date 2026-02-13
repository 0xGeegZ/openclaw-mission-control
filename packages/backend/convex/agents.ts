import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember, requireAccountAdmin } from "./lib/auth";
import { agentStatusValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";
import { generateDefaultSoul } from "./lib/agent_soul";
import { Id, Doc } from "./_generated/dataModel";
import { AVAILABLE_MODELS, DEFAULT_OPENCLAW_CONFIG } from "@packages/shared";
import { checkQuota, incrementUsage } from "./lib/quotaHelpers";
import { ConvexError, ErrorCode } from "./lib/errors";

/**
 * Generate a session key for an agent.
 * Format: agent:{slug}:{accountId}
 */
function generateSessionKey(slug: string, accountId: Id<"accounts">): string {
  return `agent:${slug}:${accountId}`;
}

/**
 * Get default OpenClaw config for new agents.
 */
function getDefaultOpenclawConfig() {
  return {
    ...DEFAULT_OPENCLAW_CONFIG,
    skillIds: [],
    contextConfig: { ...DEFAULT_OPENCLAW_CONFIG.contextConfig },
    behaviorFlags: { ...DEFAULT_OPENCLAW_CONFIG.behaviorFlags },
  };
}

/**
 * List all agents for an account.
 * Ordered: Orchestrator first (if set), then others alphabetically by name.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<Doc<"agents">[]> => {
    await requireAccountMember(ctx, args.accountId);

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const account = await ctx.db.get(args.accountId);
    const orchestratorAgentId = (
      account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined
    )?.orchestratorAgentId;

    agents.sort((a, b) => {
      const aIsOrchestrator =
        orchestratorAgentId != null && a._id === orchestratorAgentId;
      const bIsOrchestrator =
        orchestratorAgentId != null && b._id === orchestratorAgentId;
      if (aIsOrchestrator && !bIsOrchestrator) return -1;
      if (!aIsOrchestrator && bIsOrchestrator) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return agents;
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
        q.eq("accountId", args.accountId).eq("status", args.status),
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
        q.eq("accountId", args.accountId).eq("slug", args.slug),
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
          currentTask: currentTask
            ? {
                _id: currentTask._id,
                title: currentTask.title,
                status: currentTask.status,
              }
            : null,
        };
      }),
    );

    const account = await ctx.db.get(args.accountId);
    const orchestratorAgentId = (
      account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined
    )?.orchestratorAgentId;

    // Sort: Orchestrator first, then by status, then by name
    roster.sort((a, b) => {
      const aIsOrchestrator =
        orchestratorAgentId != null && a._id === orchestratorAgentId;
      const bIsOrchestrator =
        orchestratorAgentId != null && b._id === orchestratorAgentId;
      if (aIsOrchestrator && !bIsOrchestrator) return -1;
      if (!aIsOrchestrator && bIsOrchestrator) return 1;

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
    icon: v.optional(v.string()),
    soulContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    // Check agent quota before proceeding
    const quotaCheck = await checkQuota(ctx, args.accountId, "agents");
    if (!quotaCheck.allowed) {
      throw new Error(
        `Quota exceeded: ${quotaCheck.message}. Upgrade your plan to create more agents.`,
      );
    }

    // Check slug uniqueness within account
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_account_slug", (q) =>
        q.eq("accountId", args.accountId).eq("slug", args.slug),
      )
      .unique();

    if (existing) {
      throw new ConvexError(
        ErrorCode.CONFLICT,
        "Agent slug already exists in this account",
        { accountId: args.accountId, slug: args.slug },
      );
    }

    const account = await ctx.db.get(args.accountId);
    const agentDefaults = (
      account?.settings as
        | { agentDefaults?: Record<string, unknown> }
        | undefined
    )?.agentDefaults;
    const openclawConfig = {
      ...getDefaultOpenclawConfig(),
      ...agentDefaults,
    };

    const sessionKey = generateSessionKey(args.slug, args.accountId);

    const soulContent =
      args.soulContent ?? generateDefaultSoul(args.name, args.role);

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
      icon: args.icon,
      soulContent,
      openclawConfig,
      createdAt: Date.now(),
    });

    // Increment agent quota usage after successful insert
    await incrementUsage(ctx, args.accountId, "agents");

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
    icon: v.optional(v.string()),
    soulContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new ConvexError(ErrorCode.NOT_FOUND, "Agent does not exist", { agentId: args.agentId });
    }

    const { userId, userName } = await requireAccountAdmin(
      ctx,
      agent.accountId,
    );

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) updates.name = args.name;
    if (args.role !== undefined) updates.role = args.role;
    if (args.description !== undefined) updates.description = args.description;
    if (args.heartbeatInterval !== undefined)
      updates.heartbeatInterval = args.heartbeatInterval;
    if (args.avatarUrl !== undefined) updates.avatarUrl = args.avatarUrl;
    if (args.icon !== undefined) updates.icon = args.icon;
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
      throw new ConvexError(ErrorCode.NOT_FOUND, "Agent does not exist", { agentId: args.agentId });
    }

    // For now, allow status updates from authenticated users
    // Service calls will use a separate endpoint
    const { userId, userName } = await requireAccountMember(
      ctx,
      agent.accountId,
    );

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
      throw new ConvexError(ErrorCode.NOT_FOUND, "Agent does not exist", { agentId: args.agentId });
    }

    await requireAccountAdmin(ctx, agent.accountId);

    const account = await ctx.db.get(agent.accountId);
    const settings = account?.settings as
      | { orchestratorAgentId?: Id<"agents"> }
      | undefined;
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
          assignedAgentIds: task.assignedAgentIds.filter(
            (id) => id !== args.agentId,
          ),
        });
      }
    }

    // Delete notifications for this agent
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) =>
        q
          .eq("accountId", agent.accountId)
          .eq("recipientType", "agent")
          .eq("recipientId", args.agentId),
      )
      .collect();

    for (const notification of notifications) {
      await ctx.db.delete(notification._id);
    }

    // Delete subscriptions for this agent
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_subscriber", (q) =>
        q.eq("subscriberType", "agent").eq("subscriberId", args.agentId),
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
      soulContent:
        agent.soulContent ?? generateDefaultSoul(agent.name, agent.role),
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
      contextConfig: v.optional(
        v.object({
          maxHistoryMessages: v.number(),
          includeTaskContext: v.boolean(),
          includeTeamContext: v.boolean(),
          customContextSources: v.optional(v.array(v.string())),
        }),
      ),
      rateLimits: v.optional(
        v.object({
          requestsPerMinute: v.number(),
          tokensPerDay: v.optional(v.number()),
        }),
      ),
      behaviorFlags: v.optional(
        v.object({
          canCreateTasks: v.boolean(),
          canModifyTaskStatus: v.boolean(),
          canCreateDocuments: v.boolean(),
          canMentionAgents: v.boolean(),
          requiresApprovalForActions: v.optional(v.array(v.string())),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new ConvexError(ErrorCode.NOT_FOUND, "Agent does not exist", { agentId: args.agentId });
    }

    const { userId, userName } = await requireAccountAdmin(
      ctx,
      agent.accountId,
    );

    const normalizedModel = args.config.model.trim();
    const validModelValues: string[] = AVAILABLE_MODELS.map(
      (model) => model.value,
    );
    if (!validModelValues.includes(normalizedModel)) {
      throw new ConvexError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid model: "${normalizedModel}". Must be one of: ${validModelValues.join(", ")}`,
        { model: normalizedModel, validModels: validModelValues },
      );
    }

    // Validate all skillIds exist and belong to same account
    for (const skillId of args.config.skillIds) {
      const skill = await ctx.db.get(skillId);
      if (!skill || skill.accountId !== agent.accountId) {
        throw new ConvexError(ErrorCode.VALIDATION_ERROR, `Invalid skill: ${skillId}`);
      }
      if (!skill.isEnabled) {
        throw new ConvexError(
          ErrorCode.VALIDATION_ERROR,
          `Skill is disabled: ${skill.name}`,
          { skillId, skillName: skill.name },
        );
      }
    }

    await ctx.db.patch(args.agentId, {
      openclawConfig: {
        ...args.config,
        model: normalizedModel,
      },
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
    let skills: (Doc<"skills"> | null)[] = [];
    if (agent.openclawConfig?.skillIds) {
      skills = await Promise.all(
        agent.openclawConfig.skillIds.map((id) => ctx.db.get(id)),
      );
    }
    const resolvedSkills: Doc<"skills">[] = skills.filter(
      (s): s is Doc<"skills"> => s !== null,
    );

    return {
      ...agent,
      resolvedSkills: resolvedSkills,
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
      throw new ConvexError(ErrorCode.NOT_FOUND, "Agent does not exist", { agentId: args.agentId });
    }

    await requireAccountAdmin(ctx, agent.accountId);

    // Validate all skills
    for (const skillId of args.skillIds) {
      const skill = await ctx.db.get(skillId);
      if (!skill || skill.accountId !== agent.accountId) {
        throw new ConvexError(ErrorCode.VALIDATION_ERROR, `Invalid skill: ${skillId}`);
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
