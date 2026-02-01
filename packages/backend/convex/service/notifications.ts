import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * List undelivered agent notifications for an account (service-only).
 * Used by runtime to fetch notifications to deliver.
 * Must be called from service action with validated service token.
 */
export const listUndeliveredForAccount = internalQuery({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_undelivered", (q) => 
        q.eq("accountId", args.accountId)
         .eq("recipientType", "agent")
         .eq("deliveredAt", undefined)
      )
      .collect();
    
    // Sort by created (oldest first for FIFO)
    notifications.sort((a, b) => a.createdAt - b.createdAt);
    
    const limit = args.limit ?? 100;
    return notifications.slice(0, limit);
  },
});

/**
 * Mark a notification as delivered.
 * Called by runtime after successfully delivering to OpenClaw.
 */
export const markDelivered = internalMutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Not found: Notification does not exist");
    }
    
    if (!notification.deliveredAt) {
      await ctx.db.patch(args.notificationId, {
        deliveredAt: Date.now(),
      });
    }
    
    return true;
  },
});

/**
 * Get notification details for delivery (service-only).
 * Returns full context needed to deliver to agent.
 * Must be called from service action with validated service token.
 */
export const getForDelivery = internalQuery({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      return null;
    }
    
    // Get agent details
    let agent = null;
    if (notification.recipientType === "agent") {
      agent = await ctx.db.get(notification.recipientId as Id<"agents">);
    }
    
    // Get task details if present
    let task = null;
    if (notification.taskId) {
      task = await ctx.db.get(notification.taskId);
    }
    
    // Get message details if present
    let message = null;
    if (notification.messageId) {
      message = await ctx.db.get(notification.messageId);
    }
    
    return {
      notification,
      agent,
      task,
      message,
    };
  },
});

/**
 * Batch mark notifications as delivered.
 */
export const batchMarkDelivered = internalMutation({
  args: {
    notificationIds: v.array(v.id("notifications")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    for (const notificationId of args.notificationIds) {
      const notification = await ctx.db.get(notificationId);
      if (notification && !notification.deliveredAt) {
        await ctx.db.patch(notificationId, { deliveredAt: now });
      }
    }
    
    return { count: args.notificationIds.length };
  },
});
