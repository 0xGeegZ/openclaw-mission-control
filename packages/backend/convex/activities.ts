import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { activityTypeValidator } from "./lib/validators";

/**
 * List activities for an account (activity feed).
 * Returns most recent first.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
    beforeTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    let activities = await ctx.db
      .query("activities")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .collect();
    
    // Filter by timestamp if provided (for pagination)
    if (args.beforeTimestamp !== undefined) {
      const beforeTimestamp = args.beforeTimestamp;
      activities = activities.filter(a => a.createdAt < beforeTimestamp);
    }
    
    // Apply limit
    const limit = args.limit ?? 50;
    activities = activities.slice(0, limit);
    
    return activities;
  },
});

/**
 * List activities for a specific target (e.g., all activities for a task).
 */
export const listByTarget = query({
  args: {
    targetType: v.union(
      v.literal("task"),
      v.literal("message"),
      v.literal("document"),
      v.literal("agent"),
      v.literal("account"),
      v.literal("membership")
    ),
    targetId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_target", (q) => 
        q.eq("targetType", args.targetType).eq("targetId", args.targetId)
      )
      .order("desc")
      .collect();
    
    // Verify user has access to at least one activity's account
    if (activities.length > 0) {
      await requireAccountMember(ctx, activities[0].accountId);
    }
    
    const limit = args.limit ?? 20;
    return activities.slice(0, limit);
  },
});

/**
 * List activities by type.
 */
export const listByType = query({
  args: {
    accountId: v.id("accounts"),
    type: activityTypeValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .collect();
    
    const filtered = activities.filter(a => a.type === args.type);
    
    const limit = args.limit ?? 50;
    return filtered.slice(0, limit);
  },
});

/**
 * Get activity count for an account (for badges).
 */
export const getRecentCount = query({
  args: {
    accountId: v.id("accounts"),
    sinceTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .collect();
    
    return activities.filter(a => a.createdAt >= args.sinceTimestamp).length;
  },
});
