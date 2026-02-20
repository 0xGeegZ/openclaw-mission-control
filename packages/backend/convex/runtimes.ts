import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import {
  requireAuth,
  requireAccountMember,
  requireAccountAdmin,
} from "./lib/auth";
import { sanitizeUpgradeError } from "./lib/sanitize";
const upgradeStrategyValidator = v.union(
  v.literal("immediate"),
  v.literal("rolling"),
  v.literal("canary"),
);

const upgradeResultStatusValidator = v.union(
  v.literal("success"),
  v.literal("failed"),
  v.literal("rolled_back"),
);

/** Max entries to keep in upgradeHistory. */
const MAX_UPGRADE_HISTORY = 10;

/**
 * Get runtime for an account (single runtime per account in v1/v2).
 */
export const getByAccount = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    return ctx.db
      .query("runtimes")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .first();
  },
});

/**
 * List runtimes for accounts where the current user is admin or owner.
 * Used by fleet admin UI.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authContext = await requireAuth(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (index) => index.eq("userId", authContext.userId))
      .collect();
    const adminAccountIds = new Set(
      memberships
        .filter((m) => m.role === "admin" || m.role === "owner")
        .map((m) => m.accountId),
    );
    if (adminAccountIds.size === 0) {
      return [];
    }
    const runtimeLookups = await Promise.all(
      Array.from(adminAccountIds).map((accountId) =>
        ctx.db
          .query("runtimes")
          .withIndex("by_account", (index) => index.eq("accountId", accountId))
          .first(),
      ),
    );
    const filtered = runtimeLookups.filter((runtime) => runtime != null);
    const limit = args.limit ?? 100;
    return filtered.slice(0, limit);
  },
});

/**
 * Internal: get runtime by account (for runtime service).
 */
export const getByAccountInternal = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("runtimes")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .first();
  },
});

/**
 * Internal: list all runtimes (for fleet orchestration only).
 */
export const listAllInternal = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
    return await ctx.db.query("runtimes").take(limit);
  },
});

/**
 * Internal: set pending upgrade on a runtime (for fleet orchestration).
 */
export const setPendingUpgradeInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    targetOpenclawVersion: v.string(),
    targetRuntimeVersion: v.string(),
    strategy: upgradeStrategyValidator,
    initiatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const runtime = await ctx.db
      .query("runtimes")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .first();
    if (!runtime) return;
    await ctx.db.patch(runtime._id, {
      pendingUpgrade: {
        targetOpenclawVersion: args.targetOpenclawVersion,
        targetRuntimeVersion: args.targetRuntimeVersion,
        initiatedAt: Date.now(),
        initiatedBy: args.initiatedBy,
        strategy: args.strategy,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: mark a pending upgrade as failed and clear it.
 */
export const markPendingUpgradeFailedInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const runtime = await ctx.db
      .query("runtimes")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .first();
    if (!runtime || !runtime.pendingUpgrade) return;
    const entry = {
      fromOpenclawVersion: runtime.openclawVersion,
      toOpenclawVersion: runtime.pendingUpgrade.targetOpenclawVersion,
      fromRuntimeVersion: runtime.runtimeServiceVersion,
      toRuntimeVersion: runtime.pendingUpgrade.targetRuntimeVersion,
      status: "failed" as const,
      startedAt: runtime.pendingUpgrade.initiatedAt,
      completedAt: Date.now(),
      error:
        sanitizeUpgradeError(args.error ?? "Upgrade timed out") ??
        "Upgrade timed out",
      initiatedBy: runtime.pendingUpgrade.initiatedBy,
    };
    const history = [...(runtime.upgradeHistory ?? []), entry].slice(
      -MAX_UPGRADE_HISTORY,
    );
    await ctx.db.patch(runtime._id, {
      pendingUpgrade: undefined,
      upgradeHistory: history,
      status: "error",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Request an upgrade for the account's runtime (admin only).
 * Sets pendingUpgrade; runtime applies it on next health check when strategy is "immediate".
 */
export const requestUpgrade = mutation({
  args: {
    accountId: v.id("accounts"),
    targetOpenclawVersion: v.optional(v.string()),
    targetRuntimeVersion: v.string(),
    strategy: upgradeStrategyValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    const runtime = await ctx.db
      .query("runtimes")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .first();
    if (!runtime) {
      throw new Error("No runtime registered for this account");
    }
    const identity = await ctx.auth.getUserIdentity();
    const initiatedBy = identity?.subject ?? "unknown";
    await ctx.db.patch(runtime._id, {
      pendingUpgrade: {
        targetOpenclawVersion:
          args.targetOpenclawVersion ?? runtime.openclawVersion,
        targetRuntimeVersion: args.targetRuntimeVersion,
        initiatedAt: Date.now(),
        initiatedBy,
        strategy: args.strategy,
      },
      updatedAt: Date.now(),
    });
    return runtime._id;
  },
});

/**
 * Clear pending upgrade request (admin only).
 */
export const clearUpgradeRequest = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    const runtime = await ctx.db
      .query("runtimes")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .first();
    if (!runtime) return;
    await ctx.db.patch(runtime._id, {
      pendingUpgrade: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Record upgrade result (internal). Called by service action after runtime applies or fails upgrade.
 */
export const recordUpgradeResultInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    status: upgradeResultStatusValidator,
    fromOpenclawVersion: v.string(),
    toOpenclawVersion: v.string(),
    fromRuntimeVersion: v.string(),
    toRuntimeVersion: v.string(),
    duration: v.optional(v.number()),
    error: v.optional(v.string()),
    initiatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const runtime = await ctx.db
      .query("runtimes")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .first();
    if (!runtime) return;
    const entry = {
      fromOpenclawVersion: args.fromOpenclawVersion,
      toOpenclawVersion: args.toOpenclawVersion,
      fromRuntimeVersion: args.fromRuntimeVersion,
      toRuntimeVersion: args.toRuntimeVersion,
      status: args.status,
      startedAt: runtime.pendingUpgrade?.initiatedAt ?? Date.now(),
      completedAt: Date.now(),
      duration: args.duration,
      error: sanitizeUpgradeError(args.error),
      initiatedBy: args.initiatedBy,
    };
    const history = [...(runtime.upgradeHistory ?? []), entry].slice(
      -MAX_UPGRADE_HISTORY,
    );
    const newStatus =
      args.status === "success"
        ? "online"
        : args.status === "failed"
          ? "error"
          : "online";
    await ctx.db.patch(runtime._id, {
      pendingUpgrade: undefined,
      upgradeHistory: history,
      status: newStatus,
      openclawVersion:
        args.status === "success"
          ? args.toOpenclawVersion
          : runtime.openclawVersion,
      runtimeServiceVersion:
        args.status === "success"
          ? args.toRuntimeVersion
          : runtime.runtimeServiceVersion,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Rollback runtime: record a "rolled_back" entry and optionally set pendingUpgrade to previous version.
 * Admin only.
 */
export const rollbackRuntime = mutation({
  args: {
    accountId: v.id("accounts"),
    /** If set, set pendingUpgrade to this version so runtime restarts with it. */
    targetOpenclawVersion: v.optional(v.string()),
    targetRuntimeVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    const runtime = await ctx.db
      .query("runtimes")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .first();
    if (!runtime) {
      throw new Error("No runtime registered for this account");
    }
    const lastSuccess = [...(runtime.upgradeHistory ?? [])]
      .reverse()
      .find((e) => e.status === "success");
    const fromOpenclaw = runtime.openclawVersion;
    const fromRuntime = runtime.runtimeServiceVersion;
    const toOpenclaw = lastSuccess?.fromOpenclawVersion ?? fromOpenclaw;
    const toRuntime = lastSuccess?.fromRuntimeVersion ?? fromRuntime;
    const identity = await ctx.auth.getUserIdentity();
    const initiatedBy = identity?.subject ?? "unknown";
    const entry = {
      fromOpenclawVersion: fromOpenclaw,
      toOpenclawVersion: toOpenclaw,
      fromRuntimeVersion: fromRuntime,
      toRuntimeVersion: toRuntime,
      status: "rolled_back" as const,
      startedAt: Date.now(),
      completedAt: Date.now(),
      initiatedBy,
    };
    const history = [...(runtime.upgradeHistory ?? []), entry].slice(
      -MAX_UPGRADE_HISTORY,
    );
    const updates: Record<string, unknown> = {
      upgradeHistory: history,
      updatedAt: Date.now(),
    };
    if (
      args.targetOpenclawVersion != null ||
      args.targetRuntimeVersion != null
    ) {
      updates.pendingUpgrade = {
        targetOpenclawVersion: args.targetOpenclawVersion ?? toOpenclaw,
        targetRuntimeVersion: args.targetRuntimeVersion ?? toRuntime,
        initiatedAt: Date.now(),
        initiatedBy,
        strategy: "immediate" as const,
      };
    }
    await ctx.db.patch(runtime._id, updates);
  },
});
