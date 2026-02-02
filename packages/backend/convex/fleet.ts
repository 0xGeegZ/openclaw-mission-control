import { v } from "convex/values";
import { action, internalQuery, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const ORCHESTRATOR_INITIATED_BY = "fleet-orchestrator";
const DEFAULT_UPGRADE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Action-only admin guard (uses internal query since actions lack db access).
 */
async function requireAccountAdminAction(
  ctx: ActionCtx,
  accountId: Id<"accounts">
): Promise<{ userId: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: Must be authenticated");
  }
  const membership = await ctx.runQuery(internal.memberships.getByAccountUser, {
    accountId,
    userId: identity.subject,
  });
  if (!membership) {
    throw new Error("Forbidden: Not a member of this account");
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    throw new Error("Forbidden: Admin or owner role required");
  }
  return { userId: identity.subject };
}

/**
 * Action-only orchestrator guard (requires configured user id).
 */
async function requireOrchestratorAction(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: Must be authenticated");
  }
  const orchestratorUserId = await ctx.runQuery(internal.fleet.getConfigInternal, {
    key: "fleet_orchestrator_user_id",
  });
  if (!orchestratorUserId) {
    throw new Error("Fleet orchestration is disabled. Set systemConfig fleet_orchestrator_user_id.");
  }
  if (orchestratorUserId !== identity.subject) {
    throw new Error("Forbidden: Requires fleet orchestration privileges.");
  }
  return identity.subject;
}

/**
 * Internal: get a system config value by key (for feature flags and orchestration).
 */
export const getConfigInternal = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return row?.value ?? null;
  },
});

/**
 * Run canary upgrade: set pendingUpgrade on a single "canary" runtime.
 * Feature-flagged via systemConfig key "fleet_orchestration_enabled" = "true".
 */
export const runCanaryUpgrade = action({
  args: {
    canaryAccountId: v.id("accounts"),
    targetOpenclawVersion: v.string(),
    targetRuntimeVersion: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAccountAdminAction(ctx, args.canaryAccountId);
    const enabled = await ctx.runQuery(internal.fleet.getConfigInternal, {
      key: "fleet_orchestration_enabled",
    });
    if (enabled !== "true") {
      throw new Error("Fleet orchestration is disabled. Set systemConfig fleet_orchestration_enabled=true.");
    }
    await ctx.runMutation(internal.runtimes.setPendingUpgradeInternal, {
      accountId: args.canaryAccountId,
      targetOpenclawVersion: args.targetOpenclawVersion,
      targetRuntimeVersion: args.targetRuntimeVersion,
      strategy: "canary",
      initiatedBy: ORCHESTRATOR_INITIATED_BY,
    });
    return { ok: true, message: "Canary upgrade requested for account " + args.canaryAccountId };
  },
});

/** Return type for runRollingUpgrade. */
interface RunRollingUpgradeResult {
  ok: boolean;
  requested: number;
  totalWithoutPending: number;
  message: string;
}

/**
 * Run rolling upgrade: set pendingUpgrade on a batch of runtimes (default 10%).
 * Feature-flagged via systemConfig key "fleet_orchestration_enabled" = "true".
 */
export const runRollingUpgrade = action({
  args: {
    targetOpenclawVersion: v.string(),
    targetRuntimeVersion: v.string(),
    batchSizePercent: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RunRollingUpgradeResult> => {
    await requireOrchestratorAction(ctx);
    const enabled = await ctx.runQuery(internal.fleet.getConfigInternal, {
      key: "fleet_orchestration_enabled",
    });
    if (enabled !== "true") {
      throw new Error("Fleet orchestration is disabled. Set systemConfig fleet_orchestration_enabled=true.");
    }
    const percent = Math.min(100, Math.max(1, args.batchSizePercent ?? 10));
    const allRuntimes: Doc<"runtimes">[] = await ctx.runQuery(internal.runtimes.listAllInternal, {});
    const withoutPending = allRuntimes.filter((r) => !r.pendingUpgrade);
    const batchSize = Math.max(1, Math.ceil((withoutPending.length * percent) / 100));
    const batch = withoutPending.slice(0, batchSize);
    for (const r of batch) {
      await ctx.runMutation(internal.runtimes.setPendingUpgradeInternal, {
        accountId: r.accountId,
        targetOpenclawVersion: args.targetOpenclawVersion,
        targetRuntimeVersion: args.targetRuntimeVersion,
        strategy: "rolling",
        initiatedBy: ORCHESTRATOR_INITIATED_BY,
      });
    }
    return {
      ok: true,
      requested: batch.length,
      totalWithoutPending: withoutPending.length,
      message: `Rolling upgrade requested for ${batch.length} runtime(s).`,
    };
  },
});

/**
 * Sweep stale pending upgrades and mark them as failed.
 * Feature-flagged via systemConfig key "fleet_orchestration_enabled" = "true".
 */
export const sweepUpgradeTimeouts = action({
  args: {
    timeoutMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ scanned: number; failed: number }> => {
    await requireOrchestratorAction(ctx);
    const enabled = await ctx.runQuery(internal.fleet.getConfigInternal, {
      key: "fleet_orchestration_enabled",
    });
    if (enabled !== "true") {
      throw new Error("Fleet orchestration is disabled. Set systemConfig fleet_orchestration_enabled=true.");
    }
    const timeoutMs = Math.max(60_000, args.timeoutMs ?? DEFAULT_UPGRADE_TIMEOUT_MS);
    const now = Date.now();
    const runtimes: Doc<"runtimes">[] = await ctx.runQuery(internal.runtimes.listAllInternal, {
      limit: args.limit,
    });
    let failed = 0;
    for (const runtime of runtimes) {
      if (!runtime.pendingUpgrade) continue;
      const ageMs = now - runtime.pendingUpgrade.initiatedAt;
      if (ageMs <= timeoutMs) continue;
      await ctx.runMutation(internal.runtimes.markPendingUpgradeFailedInternal, {
        accountId: runtime.accountId,
        error: "Upgrade timed out",
      });
      failed += 1;
    }
    return { scanned: runtimes.length, failed };
  },
});
