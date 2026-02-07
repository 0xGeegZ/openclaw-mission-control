import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  requireAuth,
  requireAccountMember,
  requireAccountAdmin,
  requireAccountOwner,
} from "./lib/auth";
import { AVAILABLE_MODELS } from "@packages/shared";
import { cascadeDeleteAccount } from "./lib/reference_validation";

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
 * Get account by ID (internal query).
 * No auth required - for use in service actions.
 */
export const getInternal = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
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
        q.eq("accountId", account._id).eq("userId", authContext.userId),
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
      }),
    );

    return accounts.filter(Boolean);
  },
});

const agentDefaultsValidator = v.object({
  model: v.optional(v.string()),
  temperature: v.optional(v.number()),
  maxTokens: v.optional(v.number()),
  maxHistoryMessages: v.optional(v.number()),
  behaviorFlags: v.optional(
    v.object({
      canCreateTasks: v.boolean(),
      canModifyTaskStatus: v.boolean(),
      canCreateDocuments: v.boolean(),
      canMentionAgents: v.boolean(),
    }),
  ),
  rateLimits: v.optional(
    v.object({
      requestsPerMinute: v.optional(v.number()),
      tokensPerDay: v.optional(v.number()),
    }),
  ),
});

const accountSettingsValidator = v.object({
  theme: v.optional(v.string()),
  notificationPreferences: v.optional(
    v.object({
      taskUpdates: v.boolean(),
      agentActivity: v.boolean(),
      emailDigest: v.boolean(),
      memberUpdates: v.boolean(),
    }),
  ),
  agentDefaults: v.optional(agentDefaultsValidator),
  /** Pass null to clear the orchestrator. */
  orchestratorAgentId: v.optional(v.union(v.id("agents"), v.null())),
  /** Pass null to clear the orchestrator chat task. */
  orchestratorChatTaskId: v.optional(v.union(v.id("tasks"), v.null())),
});

/**
 * Update account details (name, slug, settings).
 * Requires admin role. Slug must be unique if changed.
 */
export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    settings: v.optional(accountSettingsValidator),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Not found: Account does not exist");
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) {
      updates.name = args.name;
    }
    if (args.slug !== undefined) {
      if (args.slug !== account.slug) {
        const existing = await ctx.db
          .query("accounts")
          .withIndex("by_slug", (q) => q.eq("slug", args.slug!))
          .unique();
        if (existing) {
          throw new Error("Conflict: Account slug already exists");
        }
        updates.slug = args.slug;
      }
    }
    if (args.settings !== undefined) {
      if (
        "orchestratorAgentId" in args.settings &&
        args.settings.orchestratorAgentId != null
      ) {
        const agent = await ctx.db.get(args.settings.orchestratorAgentId);
        if (!agent || agent.accountId !== args.accountId) {
          throw new Error(
            "Orchestrator agent not found or does not belong to this account",
          );
        }
      }
      if (
        "orchestratorChatTaskId" in args.settings &&
        args.settings.orchestratorChatTaskId != null
      ) {
        const task = await ctx.db.get(args.settings.orchestratorChatTaskId);
        if (!task || task.accountId !== args.accountId) {
          throw new Error(
            "Orchestrator chat task not found or does not belong to this account",
          );
        }
      }
      const validModelValues: string[] = AVAILABLE_MODELS.map((m) => m.value);
      if (args.settings.agentDefaults?.model != null) {
        const model = String(args.settings.agentDefaults.model).trim();
        if (model && !validModelValues.includes(model)) {
          throw new Error(
            `Invalid agent default model: "${model}". Must be one of: ${validModelValues.join(", ")}`,
          );
        }
      }
      const current =
        (
          account as {
            settings?: {
              theme?: string;
              notificationPreferences?: {
                taskUpdates?: boolean;
                agentActivity?: boolean;
                emailDigest?: boolean;
                memberUpdates?: boolean;
              };
              agentDefaults?: Record<string, unknown>;
              orchestratorAgentId?: string;
              orchestratorChatTaskId?: string;
            };
          }
        ).settings ?? {};
      updates.settings = {
        ...current,
        ...(args.settings.theme !== undefined && {
          theme: args.settings.theme,
        }),
        ...(args.settings.notificationPreferences !== undefined && {
          notificationPreferences: {
            ...(current.notificationPreferences ?? {}),
            ...args.settings.notificationPreferences,
          },
        }),
        ...(args.settings.agentDefaults !== undefined && {
          agentDefaults: args.settings.agentDefaults,
        }),
        ...("orchestratorAgentId" in args.settings && {
          orchestratorAgentId:
            args.settings.orchestratorAgentId === null
              ? undefined
              : args.settings.orchestratorAgentId,
        }),
        ...("orchestratorChatTaskId" in args.settings && {
          orchestratorChatTaskId:
            args.settings.orchestratorChatTaskId === null
              ? undefined
              : args.settings.orchestratorChatTaskId,
        }),
      };
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.accountId, updates);
    }

    return args.accountId;
  },
});

/**
 * Request runtime restart (admin only).
 * Sets restartRequestedAt; runtime service should poll and clear after restart.
 */
export const requestRestart = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    await ctx.db.patch(args.accountId, { restartRequestedAt: Date.now() });
    return args.accountId;
  },
});

/**
 * Clear restart requested flag (internal mutation).
 * Called by runtime after it sees restartRequestedAt and is about to exit.
 */
export const clearRestartRequestedInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return;
    await ctx.db.patch(args.accountId, { restartRequestedAt: undefined });
  },
});

/**
 * Update account runtime status (internal mutation).
 * Called by service actions with validated service tokens.
 *
 * Includes version tracking for OpenClaw and runtime service.
 */
export const updateRuntimeStatusInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    status: v.union(
      v.literal("provisioning"),
      v.literal("online"),
      v.literal("degraded"),
      v.literal("offline"),
      v.literal("error"),
    ),
    config: v.optional(
      v.object({
        dropletId: v.string(),
        ipAddress: v.string(),
        region: v.optional(v.string()),
        lastHealthCheck: v.optional(v.number()),
        // Version tracking (v1)
        openclawVersion: v.optional(v.string()),
        runtimeServiceVersion: v.optional(v.string()),
        lastUpgradeAt: v.optional(v.number()),
        lastUpgradeStatus: v.optional(
          v.union(
            v.literal("success"),
            v.literal("failed"),
            v.literal("rolled_back"),
          ),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      runtimeStatus: args.status,
    };

    if (args.config) {
      updates.runtimeConfig = args.config;
    }

    await ctx.db.patch(args.accountId, updates);

    // Sync runtimes table for fleet UI (pendingUpgrade, upgradeHistory).
    const runtime = await ctx.db
      .query("runtimes")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();
    const now = Date.now();
    const cfg = args.config;
    const UPGRADE_TIMEOUT_MS = 30 * 60 * 1000;
    if (!runtime) {
      await ctx.db.insert("runtimes", {
        accountId: args.accountId,
        provider: "digitalocean",
        providerId: cfg?.dropletId ?? "",
        ipAddress: cfg?.ipAddress ?? "",
        region: cfg?.region ?? "",
        openclawVersion: cfg?.openclawVersion ?? "",
        runtimeServiceVersion: cfg?.runtimeServiceVersion ?? "",
        dockerImageTag: cfg?.runtimeServiceVersion ?? "latest",
        status: args.status,
        lastHealthCheck: cfg?.lastHealthCheck,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const targetMatches =
        runtime.pendingUpgrade != null &&
        cfg?.openclawVersion === runtime.pendingUpgrade.targetOpenclawVersion &&
        cfg?.runtimeServiceVersion ===
          runtime.pendingUpgrade.targetRuntimeVersion;
      const pendingAgeMs = runtime.pendingUpgrade
        ? now - runtime.pendingUpgrade.initiatedAt
        : 0;
      const isStale =
        runtime.pendingUpgrade != null &&
        !targetMatches &&
        pendingAgeMs > UPGRADE_TIMEOUT_MS;
      const nextHistory = targetMatches
        ? [
            ...(runtime.upgradeHistory ?? []),
            {
              fromOpenclawVersion: runtime.openclawVersion,
              toOpenclawVersion:
                cfg?.openclawVersion ?? runtime.openclawVersion,
              fromRuntimeVersion: runtime.runtimeServiceVersion,
              toRuntimeVersion:
                cfg?.runtimeServiceVersion ?? runtime.runtimeServiceVersion,
              status: "success" as const,
              startedAt: runtime.pendingUpgrade?.initiatedAt ?? now,
              completedAt: now,
              initiatedBy: runtime.pendingUpgrade?.initiatedBy ?? "runtime",
            },
          ].slice(-10)
        : isStale
          ? [
              ...(runtime.upgradeHistory ?? []),
              {
                fromOpenclawVersion: runtime.openclawVersion,
                toOpenclawVersion:
                  runtime.pendingUpgrade?.targetOpenclawVersion ??
                  runtime.openclawVersion,
                fromRuntimeVersion: runtime.runtimeServiceVersion,
                toRuntimeVersion:
                  runtime.pendingUpgrade?.targetRuntimeVersion ??
                  runtime.runtimeServiceVersion,
                status: "failed" as const,
                startedAt: runtime.pendingUpgrade?.initiatedAt ?? now,
                completedAt: now,
                error: "Upgrade timed out",
                initiatedBy: runtime.pendingUpgrade?.initiatedBy ?? "runtime",
              },
            ].slice(-10)
          : runtime.upgradeHistory;
      await ctx.db.patch(runtime._id, {
        status: args.status,
        lastHealthCheck: cfg?.lastHealthCheck,
        ipAddress: cfg?.ipAddress ?? runtime.ipAddress,
        region: cfg?.region ?? runtime.region,
        providerId: cfg?.dropletId ?? runtime.providerId,
        openclawVersion: cfg?.openclawVersion ?? runtime.openclawVersion,
        runtimeServiceVersion:
          cfg?.runtimeServiceVersion ?? runtime.runtimeServiceVersion,
        dockerImageTag: cfg?.runtimeServiceVersion ?? runtime.dockerImageTag,
        pendingUpgrade:
          targetMatches || isStale ? undefined : runtime.pendingUpgrade,
        upgradeHistory: nextHistory,
        updatedAt: now,
      });
    }

    return args.accountId;
  },
});

/**
 * Update service token hash (internal mutation).
 * Called by service actions when provisioning tokens.
 */
export const updateServiceTokenHash = internalMutation({
  args: {
    accountId: v.id("accounts"),
    serviceTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      serviceTokenHash: args.serviceTokenHash,
    });

    return args.accountId;
  },
});

/**
 * Delete account.
 * Requires owner role.
 * WARNING: This deletes all account data.
 *
 * Phase 3 Enhancement: Uses cascadeDeleteAccount helper for comprehensive cleanup.
 * Deletion order:
 * 1. Tasks (with associated messages, subscriptions, notifications, activities)
 * 2. Agents (with associated activities)
 * 3. Documents (with recursive folder deletion)
 * 4. Memberships and invitations
 * 5. Metadata (skills, uploads, standup summaries, runtimes, etc)
 * 6. Account
 */
export const remove = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountOwner(ctx, args.accountId);

    // Use cascadeDeleteAccount helper for comprehensive deletion
    await cascadeDeleteAccount(ctx.db, ctx, args.accountId);

    return true;
  },
});
