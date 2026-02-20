import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireAuth,
  requireAccountMember,
  requireAccountAdmin,
} from "./lib/auth";
import {
  agentStatusValidator,
  IDENTITY_CONTENT_MAX_LENGTH,
} from "./lib/validators";
import { logActivity } from "./lib/activity";
import { generateDefaultSoul } from "./lib/agent_soul";
import { Id, Doc } from "./_generated/dataModel";
import { AVAILABLE_MODELS, DEFAULT_OPENCLAW_CONFIG } from "@packages/shared";
import {
  buildDefaultUserContent,
  buildDefaultIdentityContent,
} from "./lib/user_identity_fallback";

/** Bounds for updateOpenclawConfig (security and sanity). */
const OPENCLAW_TEMPERATURE_MIN = 0;
const OPENCLAW_TEMPERATURE_MAX = 2;
const OPENCLAW_MAX_TOKENS_MIN = 1;
const OPENCLAW_MAX_TOKENS_MAX = 128_000;
const OPENCLAW_SYSTEM_PROMPT_PREFIX_MAX_LENGTH = 4_000;
const OPENCLAW_CUSTOM_CONTEXT_SOURCES_MAX_LENGTH = 20;
const OPENCLAW_CUSTOM_CONTEXT_SOURCE_ITEM_MAX_LENGTH = 200;
const OPENCLAW_REQUIRES_APPROVAL_ACTIONS_MAX_LENGTH = 20;
const OPENCLAW_REQUIRES_APPROVAL_ACTION_ITEM_MAX_LENGTH = 200;

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
  handler: async (ctx, args) => {
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
 * Get an agent by id with optional active system session key for display.
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

    const systemSession = await ctx.db
      .query("agentRuntimeSessions")
      .withIndex("by_account_type_agent_closed", (q) =>
        q
          .eq("accountId", agent.accountId)
          .eq("sessionType", "system")
          .eq("agentId", agent._id)
          .eq("closedAt", undefined),
      )
      .first();

    return {
      ...agent,
      systemSessionKey: systemSession?.sessionKey ?? null,
    };
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
 * Runtime lookup by session key is sourced from agentRuntimeSessions only.
 */
export const getBySessionKey = query({
  args: {
    sessionKey: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionRow = await ctx.db
      .query("agentRuntimeSessions")
      .withIndex("by_session_key", (q) => q.eq("sessionKey", args.sessionKey))
      .first();
    if (!sessionRow) return null;
    return await ctx.db.get(sessionRow.agentId);
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
    identityContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    // Check slug uniqueness within account
    const existing = await ctx.db
      .query("agents")
      .withIndex("by_account_slug", (q) =>
        q.eq("accountId", args.accountId).eq("slug", args.slug),
      )
      .unique();

    if (existing) {
      throw new Error("Conflict: Agent slug already exists in this account");
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

    const soulContent =
      args.soulContent ?? generateDefaultSoul(args.name, args.role);

    if (args.identityContent !== undefined) {
      const trimmed = args.identityContent.trim();
      if (trimmed.length > IDENTITY_CONTENT_MAX_LENGTH) {
        throw new Error(
          `identityContent exceeds maximum length (${IDENTITY_CONTENT_MAX_LENGTH} characters). Got ${trimmed.length}.`,
        );
      }
    }

    const agentId = await ctx.db.insert("agents", {
      accountId: args.accountId,
      name: args.name,
      slug: args.slug,
      role: args.role,
      description: args.description,
      status: "offline",
      heartbeatInterval: args.heartbeatInterval ?? 15, // Default 15 minutes
      avatarUrl: args.avatarUrl,
      icon: args.icon,
      soulContent,
      identityContent:
        args.identityContent !== undefined
          ? (args.identityContent ?? "").trim()
          : undefined,
      openclawConfig,
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
    icon: v.optional(v.string()),
    soulContent: v.optional(v.string()),
    identityContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    const { userId, userName } = await requireAccountAdmin(
      ctx,
      agent.accountId,
    );

    if (args.identityContent !== undefined) {
      const trimmed = (args.identityContent ?? "").trim();
      if (trimmed.length > IDENTITY_CONTENT_MAX_LENGTH) {
        throw new Error(
          `identityContent exceeds maximum length (${IDENTITY_CONTENT_MAX_LENGTH} characters). Got ${trimmed.length}.`,
        );
      }
    }

    const updates: Record<string, unknown> = {};

    if (args.name !== undefined) updates.name = args.name;
    if (args.role !== undefined) updates.role = args.role;
    if (args.description !== undefined) updates.description = args.description;
    if (args.heartbeatInterval !== undefined)
      updates.heartbeatInterval = args.heartbeatInterval;
    if (args.avatarUrl !== undefined) updates.avatarUrl = args.avatarUrl;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.soulContent !== undefined) updates.soulContent = args.soulContent;
    if (args.identityContent !== undefined)
      updates.identityContent = (args.identityContent ?? "").trim();

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
      throw new Error("Not found: Agent does not exist");
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
          canReviewTasks: v.boolean(),
          canMarkDone: v.boolean(),
          requiresApprovalForActions: v.optional(v.array(v.string())),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
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
      throw new Error(
        `Invalid model: "${normalizedModel}". Must be one of: ${validModelValues.join(", ")}`,
      );
    }

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

    // Bounds for security and sanity (avoid abuse or runaway config)
    const temp = args.config.temperature;
    if (
      typeof temp !== "number" ||
      temp < OPENCLAW_TEMPERATURE_MIN ||
      temp > OPENCLAW_TEMPERATURE_MAX
    ) {
      throw new Error(
        `Invalid temperature: must be between ${OPENCLAW_TEMPERATURE_MIN} and ${OPENCLAW_TEMPERATURE_MAX}.`,
      );
    }
    const maxTok = args.config.maxTokens;
    if (maxTok !== undefined) {
      if (
        typeof maxTok !== "number" ||
        !Number.isInteger(maxTok) ||
        maxTok < OPENCLAW_MAX_TOKENS_MIN ||
        maxTok > OPENCLAW_MAX_TOKENS_MAX
      ) {
        throw new Error(
          `Invalid maxTokens: must be an integer between ${OPENCLAW_MAX_TOKENS_MIN} and ${OPENCLAW_MAX_TOKENS_MAX}.`,
        );
      }
    }
    const prefix = args.config.systemPromptPrefix;
    if (
      prefix !== undefined &&
      prefix !== null &&
      typeof prefix === "string" &&
      prefix.length > OPENCLAW_SYSTEM_PROMPT_PREFIX_MAX_LENGTH
    ) {
      throw new Error(
        `systemPromptPrefix exceeds maximum length (${OPENCLAW_SYSTEM_PROMPT_PREFIX_MAX_LENGTH} characters).`,
      );
    }
    const customSources = args.config.contextConfig?.customContextSources;
    if (customSources !== undefined && Array.isArray(customSources)) {
      if (customSources.length > OPENCLAW_CUSTOM_CONTEXT_SOURCES_MAX_LENGTH) {
        throw new Error(
          `customContextSources has more than ${OPENCLAW_CUSTOM_CONTEXT_SOURCES_MAX_LENGTH} entries.`,
        );
      }
      for (const item of customSources) {
        if (
          typeof item === "string" &&
          item.length > OPENCLAW_CUSTOM_CONTEXT_SOURCE_ITEM_MAX_LENGTH
        ) {
          throw new Error(
            `customContextSources entry exceeds ${OPENCLAW_CUSTOM_CONTEXT_SOURCE_ITEM_MAX_LENGTH} characters.`,
          );
        }
      }
    }
    const approvalActions =
      args.config.behaviorFlags?.requiresApprovalForActions;
    if (approvalActions !== undefined && Array.isArray(approvalActions)) {
      if (
        approvalActions.length > OPENCLAW_REQUIRES_APPROVAL_ACTIONS_MAX_LENGTH
      ) {
        throw new Error(
          `requiresApprovalForActions has more than ${OPENCLAW_REQUIRES_APPROVAL_ACTIONS_MAX_LENGTH} entries.`,
        );
      }
      for (const item of approvalActions) {
        if (
          typeof item === "string" &&
          item.length > OPENCLAW_REQUIRES_APPROVAL_ACTION_ITEM_MAX_LENGTH
        ) {
          throw new Error(
            `requiresApprovalForActions entry exceeds ${OPENCLAW_REQUIRES_APPROVAL_ACTION_ITEM_MAX_LENGTH} characters.`,
          );
        }
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

/**
 * One-time migration: set all agents and account defaults (in accounts the current
 * user is a member of) to the shared default model. Use after changing
 * DEFAULT_OPENCLAW_CONFIG so existing agents and the Admin OpenClaw selector use
 * the new default (e.g. minimax-m2.5).
 * Requires authentication; only migrates accounts the user belongs to.
 */
export const migrateAgentsToDefaultModel = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireAuth(ctx);

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const accountIds = Array.from(new Set(memberships.map((m) => m.accountId)));
    let agentsUpdated = 0;
    let accountsUpdated = 0;
    const newModel = DEFAULT_OPENCLAW_CONFIG.model;

    for (const accountId of accountIds) {
      const account = await ctx.db.get(accountId);
      const settings = (account?.settings ?? {}) as {
        agentDefaults?: { model?: string; [key: string]: unknown };
        [key: string]: unknown;
      };
      const agentDefaults = settings.agentDefaults ?? {};
      if (agentDefaults.model !== newModel) {
        await ctx.db.patch(accountId, {
          settings: {
            ...settings,
            agentDefaults: { ...agentDefaults, model: newModel },
          },
        });
        accountsUpdated += 1;
      }

      const agents = await ctx.db
        .query("agents")
        .withIndex("by_account", (q) => q.eq("accountId", accountId))
        .collect();

      for (const agent of agents) {
        const current = agent.openclawConfig;
        if (!current || current.model === newModel) continue;
        await ctx.db.patch(agent._id, {
          openclawConfig: {
            ...current,
            model: newModel,
          },
        });
        agentsUpdated += 1;
      }
    }

    return { agentsUpdated, accountsUpdated };
  },
});

/**
 * One-time migration: scaffold USER.md and IDENTITY.md fields and explicit review/done behavior flags.
 * Call per account (admin-only). Sets account.settings.userMd if missing; sets each agent's
 * identityContent if missing and ensures behaviorFlags.canReviewTasks/canMarkDone exist.
 * For backward compatibility, agents with slug "qa" get canReviewTasks and canMarkDone true;
 * "squad-lead" gets canMarkDone true.
 *
 * @returns { accountsUpdated, agentsUpdated }. Managed doc updates (docsUpdated) are out of scope for this mutation.
 */
export const migratePromptScaffold = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);

    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Not found: Account does not exist");
    }

    let accountsUpdated = 0;
    let agentsUpdated = 0;

    const settings = (account.settings ?? {}) as {
      userMd?: string;
      agentDefaults?: { behaviorFlags?: Record<string, unknown> };
      [key: string]: unknown;
    };

    const settingsBehaviorFlags =
      typeof settings.agentDefaults?.behaviorFlags === "object" &&
      settings.agentDefaults?.behaviorFlags !== null
        ? (settings.agentDefaults.behaviorFlags as Record<string, unknown>)
        : undefined;
    const needsAccountDefaultsBackfill =
      settingsBehaviorFlags !== undefined &&
      (typeof settingsBehaviorFlags.canReviewTasks !== "boolean" ||
        typeof settingsBehaviorFlags.canMarkDone !== "boolean");
    const needsUserMdBackfill =
      settings.userMd === undefined || settings.userMd === null;
    if (needsUserMdBackfill || needsAccountDefaultsBackfill) {
      await ctx.db.patch(args.accountId, {
        settings: {
          ...account.settings,
          ...(needsUserMdBackfill && { userMd: buildDefaultUserContent() }),
          ...(needsAccountDefaultsBackfill && {
            agentDefaults: {
              ...(settings.agentDefaults ?? {}),
              behaviorFlags: {
                ...getDefaultOpenclawConfig().behaviorFlags,
                ...settingsBehaviorFlags,
                canReviewTasks:
                  typeof settingsBehaviorFlags?.canReviewTasks === "boolean"
                    ? settingsBehaviorFlags.canReviewTasks
                    : false,
                canMarkDone:
                  typeof settingsBehaviorFlags?.canMarkDone === "boolean"
                    ? settingsBehaviorFlags.canMarkDone
                    : false,
              },
            },
          }),
        },
      });
      accountsUpdated = 1;
    }

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const defaultFlags = getDefaultOpenclawConfig().behaviorFlags;

    for (const agent of agents) {
      const updates: Record<string, unknown> = {};
      if (
        agent.identityContent === undefined ||
        agent.identityContent === null
      ) {
        updates.identityContent = buildDefaultIdentityContent(
          agent.name,
          agent.role,
        );
      }

      const flags = agent.openclawConfig?.behaviorFlags as
        | Record<string, unknown>
        | undefined;
      const needReview =
        typeof flags?.canReviewTasks !== "boolean" ||
        typeof flags?.canMarkDone !== "boolean";
      if (needReview && agent.openclawConfig) {
        const nextFlags = {
          ...defaultFlags,
          ...flags,
          canReviewTasks:
            typeof flags?.canReviewTasks === "boolean"
              ? flags.canReviewTasks
              : agent.slug === "qa",
          canMarkDone:
            typeof flags?.canMarkDone === "boolean"
              ? flags.canMarkDone
              : agent.slug === "qa" || agent.slug === "squad-lead",
        };
        updates.openclawConfig = {
          ...agent.openclawConfig,
          behaviorFlags: nextFlags,
        };
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(agent._id, updates);
        agentsUpdated += 1;
      }
    }

    return { accountsUpdated, agentsUpdated };
  },
});
