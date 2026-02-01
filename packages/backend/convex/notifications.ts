import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { Id } from "./_generated/dataModel";

/**
 * Get a single notification by ID.
 * Requires account membership to prevent unauthorized access.
 */
export const get = query({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      return null;
    }
    
    // Require account membership
    await requireAccountMember(ctx, notification.accountId);
    
    return notification;
  },
});

/**
 * List notifications for the current user.
 */
export const listMine = query({
  args: {
    accountId: v.id("accounts"),
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccountMember(ctx, args.accountId);
    
    let notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) => 
        q.eq("accountId", args.accountId)
         .eq("recipientType", "user")
         .eq("recipientId", userId)
      )
      .order("desc")
      .collect();
    
    // Filter unread only if requested
    if (args.unreadOnly) {
      notifications = notifications.filter(n => !n.readAt);
    }
    
    // Apply limit
    const limit = args.limit ?? 50;
    return notifications.slice(0, limit);
  },
});

/**
 * Get unread notification count for the current user.
 */
export const getUnreadCount = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccountMember(ctx, args.accountId);
    
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) => 
        q.eq("accountId", args.accountId)
         .eq("recipientType", "user")
         .eq("recipientId", userId)
      )
      .collect();
    
    return notifications.filter(n => !n.readAt).length;
  },
});

/**
 * Mark a notification as read.
 */
export const markRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Not found: Notification does not exist");
    }
    
    const { userId } = await requireAccountMember(ctx, notification.accountId);
    
    // Verify ownership
    if (notification.recipientType !== "user" || notification.recipientId !== userId) {
      throw new Error("Forbidden: Cannot mark others' notifications");
    }
    
    if (!notification.readAt) {
      await ctx.db.patch(args.notificationId, {
        readAt: Date.now(),
      });
    }
    
    return true;
  },
});

/**
 * Mark all notifications as read.
 */
export const markAllRead = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccountMember(ctx, args.accountId);
    
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) => 
        q.eq("accountId", args.accountId)
         .eq("recipientType", "user")
         .eq("recipientId", userId)
      )
      .collect();
    
    const now = Date.now();
    let count = 0;
    
    for (const notification of notifications) {
      if (!notification.readAt) {
        await ctx.db.patch(notification._id, { readAt: now });
        count++;
      }
    }
    
    return { count };
  },
});

/**
 * Delete a notification.
 */
export const remove = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      return true; // Already deleted
    }

    const { userId } = await requireAccountMember(ctx, notification.accountId);

    if (notification.recipientType !== "user" || notification.recipientId !== userId) {
      throw new Error("Forbidden: Cannot delete others' notifications");
    }

    await ctx.db.delete(args.notificationId);
    return true;
  },
});

/** Alias for listMine (roadmap/frontend API). */
export const list = listMine;

/** Alias for markRead (roadmap/frontend API). */
export const markAsRead = markRead;

/** Alias for markAllRead (roadmap/frontend API). */
export const markAllAsRead = markAllRead;
