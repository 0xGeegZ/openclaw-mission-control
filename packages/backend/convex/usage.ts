/**
 * Usage and quota management.
 * - Proactive quota reset daemon (hourly)
 * - Plan upgrade/downgrade handling
 * - Usage tracking and reporting
 */
import { v } from "convex/values";
import {
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { RESET_CYCLES } from "./lib/constants";
import { initializeAccountUsage, getPlanQuota } from "./lib/quotaHelpers";
import { requireAccountMember } from "./lib/auth";
import { logActivity } from "./lib/activity";

/**
 * Reset quota counters proactively for accounts where the reset window has elapsed.
 * Runs hourly via cron job to ensure quotas reset even if accounts have no activity.
 * Idempotent: safe to run multiple times.
 *
 * B2 Implementation: Quota reset daemon
 */
export const resetQuotasProactive = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let resetCount = 0;
    const errors: string[] = [];

    try {
      // Fetch all usage records
      const allUsage = await ctx.db.query("usage").collect();

      for (const usage of allUsage) {
        try {
          const updates: Record<string, number> = { updatedAt: now };
          let needsUpdate = false;

          // Reset monthly message quota if 30 days have elapsed
          if (now - usage.messagesMonthStart > RESET_CYCLES.MONTHLY) {
            updates.messagesThisMonth = 0;
            updates.messagesMonthStart = now;
            needsUpdate = true;
          }

          // Reset daily API call quota if 24 hours have elapsed
          if (now - usage.apiCallsDayStart > RESET_CYCLES.DAILY) {
            updates.apiCallsToday = 0;
            updates.apiCallsDayStart = now;
            needsUpdate = true;
          }

          if (needsUpdate) {
            await ctx.db.patch(usage._id, updates);
            resetCount++;
          }
        } catch (err) {
          errors.push(
            `Failed to reset usage for ${usage.accountId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      errors.push(
        `Quota reset daemon error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      resetCount,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now,
    };
  },
});

/**
 * Get account usage details with remaining quotas.
 * Used for dashboard display and quota enforcement.
 *
 * Returns computed usage based on reset cycles and current timestamps.
 */
export const getAccountUsage = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .first();

    if (!usage) {
      throw new Error(`Usage record not found for account ${accountId}`);
    }

    const account = await ctx.db.get(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const quota = getPlanQuota(account.plan);
    const now = Date.now();

    // Check if reset windows have elapsed
    const monthElapsed = now - usage.messagesMonthStart > RESET_CYCLES.MONTHLY;
    const dayElapsed = now - usage.apiCallsDayStart > RESET_CYCLES.DAILY;

    // Compute current usage (accounting for elapsed resets)
    const messagesThisMonth = monthElapsed ? 0 : usage.messagesThisMonth;
    const apiCallsToday = dayElapsed ? 0 : usage.apiCallsToday;

    // Compute remaining quotas
    const messagesRemaining = quota.messagesPerMonth - messagesThisMonth;
    const apiCallsRemaining = quota.apiCallsPerDay - apiCallsToday;
    const agentsRemaining = quota.agents - usage.agentCount;
    const containersRemaining = quota.maxContainers - usage.containerCount;

    return {
      planId: account.plan,
      messages: {
        current: messagesThisMonth,
        limit: quota.messagesPerMonth,
        remaining: Math.max(0, messagesRemaining),
        resetIn: monthElapsed ? 0 : RESET_CYCLES.MONTHLY - (now - usage.messagesMonthStart),
      },
      apiCalls: {
        current: apiCallsToday,
        limit: quota.apiCallsPerDay,
        remaining: Math.max(0, apiCallsRemaining),
        resetIn: dayElapsed ? 0 : RESET_CYCLES.DAILY - (now - usage.apiCallsDayStart),
      },
      agents: {
        current: usage.agentCount,
        limit: quota.agents,
        remaining: Math.max(0, agentsRemaining),
      },
      containers: {
        current: usage.containerCount,
        limit: quota.maxContainers,
        remaining: Math.max(0, containersRemaining),
      },
    };
  },
});

/**
 * Handle plan upgrade/downgrade for an account.
 * Updates account plan and usage record immediately.
 * Plan changes take effect instantly.
 *
 * B3 Implementation: Handle plan changes
 */
export const updateAccountPlan = mutation({
  args: {
    accountId: v.id("accounts"),
    newPlanId: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
  },
  handler: async (ctx, { accountId, newPlanId }) => {
    // Verify caller is account member (typically admin or owner)
    const { userId } = await requireAccountMember(ctx, accountId);

    // Verify plan is valid
    try {
      getPlanQuota(newPlanId);
    } catch {
      throw new Error(`Invalid plan: ${newPlanId}`);
    }

    // Get account and verify it exists
    const account = await ctx.db.get(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const oldPlan = account.plan;

    // Early exit if already on this plan
    if (oldPlan === newPlanId) {
      return {
        success: false,
        message: "Account is already on this plan",
      };
    }

    // Update account plan
    await ctx.db.patch(accountId, {
      plan: newPlanId,
    });

    // Ensure usage record exists and update with new plan
    const usage = await ctx.db
      .query("usage")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .first();

    if (usage) {
      await ctx.db.patch(usage._id, {
        planId: newPlanId,
        updatedAt: Date.now(),
      });
    } else {
      // Initialize if missing (shouldn't happen in normal flow)
      await initializeAccountUsage(ctx, accountId, newPlanId);
    }

    // Log activity for audit trail
    try {
      await logActivity({
        ctx,
        accountId,
        type: "account_updated",
        actorType: "user",
        actorId: userId,
        actorName: "", // Will be resolved by logActivity
        targetType: "account",
        targetId: accountId,
        targetName: account.name,
        meta: {
          oldPlan,
          newPlan: newPlanId,
          changeType: "plan_upgrade_downgrade",
        },
      });
    } catch {
      // Activity logging is optional; continue if it fails
    }

    return {
      success: true,
      message: `Plan updated from ${oldPlan} to ${newPlanId}`,
      oldPlan,
      newPlan: newPlanId,
    };
  },
});

/**
 * Internal mutation to initialize usage for a new account.
 * Called during account creation or setup.
 */
export const initializeUsage = internalMutation({
  args: {
    accountId: v.id("accounts"),
    planId: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise"))),
  },
  handler: async (ctx, { accountId, planId = "free" }) => {
    return await initializeAccountUsage(ctx, accountId, planId);
  },
});
