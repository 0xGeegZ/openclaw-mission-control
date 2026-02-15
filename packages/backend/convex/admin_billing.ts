/**
 * Admin billing and subscription management functions.
 * Provides billing subscription queries and management.
 */
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireAccountMember, requireAccountAdmin } from "./lib/auth";
import { logActivity } from "./lib/activity";

/**
 * Get the current billing subscription for an account.
 */
export const get_subscription = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    if (!subscription) {
      // Return a default free tier subscription
      return {
        accountId: args.accountId,
        plan: "free",
        status: "active",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        autoRenew: true,
        quotas: {
          containers: 1,
          messages: 1000,
          apiCalls: 100,
          agents: 1,
        },
      };
    }

    return {
      id: subscription._id,
      accountId: subscription.accountId,
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      autoRenew: subscription.autoRenew,
      customerId: subscription.customerId,
      subscriptionId: subscription.subscriptionId,
      quotas: {
        containers: subscription.plan === "enterprise" ? -1 : subscription.plan === "pro" ? 10 : 1,
        messages: subscription.plan === "enterprise" ? -1 : subscription.plan === "pro" ? 50000 : 1000,
        apiCalls: subscription.plan === "enterprise" ? -1 : subscription.plan === "pro" ? 10000 : 100,
        agents: subscription.plan === "enterprise" ? -1 : subscription.plan === "pro" ? 10 : 1,
      },
    };
  },
});

/**
 * List all billing subscriptions (admin only, for management/overview).
 */
export const list_subscriptions = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    status: v.optional(v.union(v.literal("active"), v.literal("cancelled"), v.literal("past_due"))),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    let query_result = ctx.db.query("billingSubscriptions");

    // Filter by status if provided
    if (args.status) {
      query_result = query_result.filter((sub) => sub.status === args.status);
    }

    const subscriptions = await query_result
      .skip(offset)
      .take(limit)
      .collect();

    return {
      subscriptions: subscriptions.map((sub) => ({
        id: sub._id,
        accountId: sub.accountId,
        plan: sub.plan,
        status: sub.status,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        autoRenew: sub.autoRenew,
      })),
      total: subscriptions.length,
    };
  },
});

/**
 * Update a subscription plan (admin operation).
 */
export const update_subscription = mutation({
  args: {
    accountId: v.id("accounts"),
    customerId: v.id("accounts"),
    newPlan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_account", (q) => q.eq("accountId", args.customerId))
      .unique();

    if (!subscription) {
      throw new Error("Subscription not found for this account");
    }

    const oldPlan = subscription.plan;

    // Update subscription
    await ctx.db.patch(subscription._id, {
      plan: args.newPlan,
      updatedAt: Date.now(),
    });

    // Log activity
    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_updated",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "subscription",
        targetId: subscription._id,
        targetName: args.customerId.toString(),
        meta: {
          oldPlan,
          newPlan: args.newPlan,
        },
      });
    } catch {
      // Optional logging
    }

    return {
      success: true,
      message: `Subscription updated from '${oldPlan}' to '${args.newPlan}'`,
    };
  },
});

/**
 * Cancel a subscription.
 */
export const cancel_subscription = mutation({
  args: {
    accountId: v.id("accounts"),
    customerId: v.id("accounts"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_account", (q) => q.eq("accountId", args.customerId))
      .unique();

    if (!subscription) {
      throw new Error("Subscription not found for this account");
    }

    // Update subscription status
    await ctx.db.patch(subscription._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    // Log activity
    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_deleted",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "subscription",
        targetId: subscription._id,
        targetName: args.customerId.toString(),
        meta: {
          reason: args.reason,
        },
      });
    } catch {
      // Optional logging
    }

    return {
      success: true,
      message: "Subscription cancelled successfully",
    };
  },
});

/**
 * Get billing invoices for an account.
 */
export const get_invoices = query({
  args: {
    accountId: v.id("accounts"),
    customerId: v.id("accounts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const limit = args.limit ?? 12;

    const invoices = await ctx.db
      .query("invoices")
      .filter((q) => q.eq(q.field("accountId"), args.customerId))
      .order("desc")
      .take(limit)
      .collect();

    return {
      invoices: invoices.map((inv) => ({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        currency: inv.currency ?? "USD",
        status: inv.status,
        issuedAt: inv.issuedAt,
        dueAt: inv.dueAt,
        paidAt: inv.paidAt,
      })),
      total: invoices.length,
    };
  },
});
