/**
 * Quota helpers for subscription enforcement.
 * Provides checkQuota middleware and quota validation utilities.
 */
import { Context, Id } from "../_generated/server";
import { PLAN_QUOTAS, RESET_CYCLES, ACCOUNT_PLAN } from "./constants";
import { Doc } from "../_generated/dataModel";

// ============================================================================
// TYPES
// ============================================================================

export type QuotaType = "messages" | "apiCalls" | "agents" | "containers";

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  current: number;
  limit: number;
  message: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the quota limits for a given plan.
 * Returns the quota object or throws if plan is invalid.
 */
export function getPlanQuota(planId: string) {
  const quota = PLAN_QUOTAS[planId as keyof typeof PLAN_QUOTAS];
  if (!quota) {
    throw new Error(`Invalid plan: ${planId}`);
  }
  return quota;
}

/**
 * Check if the account has exceeded quota for a given resource type.
 * Performs eager checking before mutation execution.
 *
 * @param ctx Convex context
 * @param accountId Account ID to check
 * @param quotaType Type of quota to check (messages, apiCalls, agents, containers)
 * @returns QuotaCheckResult with allowed/remaining counts
 */
export async function checkQuota(
  ctx: Context,
  accountId: Id<"accounts">,
  quotaType: QuotaType,
): Promise<QuotaCheckResult> {
  // Fetch usage and account records
  const usage = await ctx.db
    .query("usage")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

  if (!usage) {
    throw new Error(
      `Usage record not found for account ${accountId}. Run initializeAccountUsage.`,
    );
  }

  const account = await ctx.db.get(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const quota = getPlanQuota(account.plan);
  const now = Date.now();

  // Check and reset monthly counters if needed
  const monthElapsed = now - usage.messagesMonthStart > RESET_CYCLES.MONTHLY;
  const messagesThisMonth = monthElapsed ? 0 : usage.messagesThisMonth;

  // Check and reset daily counters if needed
  const dayElapsed = now - usage.apiCallsDayStart > RESET_CYCLES.DAILY;
  const apiCallsToday = dayElapsed ? 0 : usage.apiCallsToday;

  switch (quotaType) {
    case "messages": {
      const current = messagesThisMonth;
      const limit = quota.messagesPerMonth;
      const remaining = limit - current;
      return {
        allowed: remaining > 0,
        remaining: Math.max(0, remaining),
        current,
        limit,
        message: `Messages: ${current}/${limit} this month`,
      };
    }

    case "apiCalls": {
      const current = apiCallsToday;
      const limit = quota.apiCallsPerDay;
      const remaining = limit - current;
      return {
        allowed: remaining > 0,
        remaining: Math.max(0, remaining),
        current,
        limit,
        message: `API calls: ${current}/${limit} today`,
      };
    }

    case "agents": {
      const current = usage.agentCount;
      const limit = quota.agents;
      const remaining = limit - current;
      return {
        allowed: remaining > 0,
        remaining: Math.max(0, remaining),
        current,
        limit,
        message: `Agents: ${current}/${limit}`,
      };
    }

    case "containers": {
      const current = usage.containerCount;
      const limit = quota.maxContainers;
      const remaining = limit - current;
      return {
        allowed: remaining > 0,
        remaining: Math.max(0, remaining),
        current,
        limit,
        message: `Containers: ${current}/${limit}`,
      };
    }

    default:
      throw new Error(`Unknown quota type: ${quotaType}`);
  }
}

/**
 * Increment usage counter after successful mutation.
 * Resets counters if necessary based on timestamps.
 *
 * @param ctx Convex context
 * @param accountId Account ID to update
 * @param quotaType Type of quota to increment
 */
export async function incrementUsage(
  ctx: Context,
  accountId: Id<"accounts">,
  quotaType: QuotaType,
): Promise<void> {
  const usage = await ctx.db
    .query("usage")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

  if (!usage) {
    throw new Error(`Usage record not found for account ${accountId}`);
  }

  const now = Date.now();
  const updates: Partial<Doc<"usage">> = { updatedAt: now };

  // Reset monthly counters if needed
  const monthElapsed = now - usage.messagesMonthStart > RESET_CYCLES.MONTHLY;
  if (monthElapsed) {
    updates.messagesThisMonth = 1;
    updates.messagesMonthStart = now;
  } else if (quotaType === "messages") {
    updates.messagesThisMonth = usage.messagesThisMonth + 1;
  }

  // Reset daily counters if needed
  const dayElapsed = now - usage.apiCallsDayStart > RESET_CYCLES.DAILY;
  if (dayElapsed) {
    updates.apiCallsToday = 1;
    updates.apiCallsDayStart = now;
  } else if (quotaType === "apiCalls") {
    updates.apiCallsToday = usage.apiCallsToday + 1;
  }

  // Increment agent/container counts
  if (quotaType === "agents") {
    updates.agentCount = usage.agentCount + 1;
  }
  if (quotaType === "containers") {
    updates.containerCount = usage.containerCount + 1;
  }

  await ctx.db.patch(usage._id, updates);
}

/**
 * Decrement usage counter (e.g., on resource deletion).
 *
 * @param ctx Convex context
 * @param accountId Account ID to update
 * @param quotaType Type of quota to decrement
 */
export async function decrementUsage(
  ctx: Context,
  accountId: Id<"accounts">,
  quotaType: QuotaType,
): Promise<void> {
  const usage = await ctx.db
    .query("usage")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

  if (!usage) {
    throw new Error(`Usage record not found for account ${accountId}`);
  }

  const updates: Partial<Doc<"usage">> = { updatedAt: Date.now() };

  if (quotaType === "agents") {
    updates.agentCount = Math.max(0, usage.agentCount - 1);
  }
  if (quotaType === "containers") {
    updates.containerCount = Math.max(0, usage.containerCount - 1);
  }

  await ctx.db.patch(usage._id, updates);
}

/**
 * Initialize usage record for a new account.
 * Called when account is created or during migration.
 *
 * @param ctx Convex context
 * @param accountId Account ID
 * @param planId Plan ID (default: free)
 */
export async function initializeAccountUsage(
  ctx: Context,
  accountId: Id<"accounts">,
  planId: string = ACCOUNT_PLAN.FREE,
): Promise<Id<"usage">> {
  // Check if usage already exists
  const existing = await ctx.db
    .query("usage")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

  if (existing) {
    return existing._id;
  }

  const now = Date.now();
  return await ctx.db.insert("usage", {
    accountId,
    planId,
    messagesThisMonth: 0,
    messagesMonthStart: now,
    apiCallsToday: 0,
    apiCallsDayStart: now,
    agentCount: 0,
    containerCount: 0,
    resetCycle: "monthly",
    lastReset: now,
    updatedAt: now,
  });
}

/**
 * Reset monthly quotas for an account.
 * Called by the reset daemon or manually during testing.
 * Idempotent: safe to call multiple times.
 *
 * @param ctx Convex context
 * @param accountId Account ID to reset
 */
export async function resetMonthlyQuota(
  ctx: Context,
  accountId: Id<"accounts">,
): Promise<void> {
  const usage = await ctx.db
    .query("usage")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

  if (!usage) {
    return; // Account has no usage record, skip
  }

  const now = Date.now();
  const monthElapsed = now - usage.messagesMonthStart > RESET_CYCLES.MONTHLY;

  if (monthElapsed) {
    await ctx.db.patch(usage._id, {
      messagesThisMonth: 0,
      messagesMonthStart: now,
      lastReset: now,
      updatedAt: now,
    });
  }
}

/**
 * Reset daily quotas for an account.
 * Called by the reset daemon or manually during testing.
 * Idempotent: safe to call multiple times.
 *
 * @param ctx Convex context
 * @param accountId Account ID to reset
 */
export async function resetDailyQuota(
  ctx: Context,
  accountId: Id<"accounts">,
): Promise<void> {
  const usage = await ctx.db
    .query("usage")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

  if (!usage) {
    return; // Account has no usage record, skip
  }

  const now = Date.now();
  const dayElapsed = now - usage.apiCallsDayStart > RESET_CYCLES.DAILY;

  if (dayElapsed) {
    await ctx.db.patch(usage._id, {
      apiCallsToday: 0,
      apiCallsDayStart: now,
      updatedAt: now,
    });
  }
}
