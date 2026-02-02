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

const notificationTypeValidator = v.union(
  v.literal("mention"),
  v.literal("assignment"),
  v.literal("thread_update"),
  v.literal("status_change"),
  v.literal("member_added"),
  v.literal("member_removed"),
  v.literal("role_changed")
);

/**
 * List notifications for the current user.
 * Supports filter (all | unread), type filter, and limit for pagination.
 */
export const listMine = query({
  args: {
    accountId: v.id("accounts"),
    unreadOnly: v.optional(v.boolean()),
    filter: v.optional(v.union(v.literal("all"), v.literal("unread"))),
    typeFilter: v.optional(notificationTypeValidator),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccountMember(ctx, args.accountId);

    let notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_recipient", (q) =>
        q
          .eq("accountId", args.accountId)
          .eq("recipientType", "user")
          .eq("recipientId", userId)
      )
      .order("desc")
      .collect();

    if (args.filter === "unread" || args.unreadOnly) {
      notifications = notifications.filter((n) => !n.readAt);
    }
    if (args.typeFilter) {
      notifications = notifications.filter((n) => n.type === args.typeFilter);
    }

    const limit = Math.min(args.limit ?? 50, 100);
    const start = args.cursor
      ? notifications.findIndex((n) => n._id === args.cursor) + 1
      : 0;
    const page = notifications.slice(start, start + limit);
    const nextCursor =
      start + limit < notifications.length
        ? page[page.length - 1]?._id
        : null;

    return {
      notifications: page,
      nextCursor: nextCursor ?? undefined,
    };
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

/**
 * Frontend API aliases (roadmap). Keep these so the UI can call list / markAsRead / markAllAsRead
 * without changing backend naming. Do not remove.
 */
export const list = listMine;
export const markAsRead = markRead;
export const markAllAsRead = markAllRead;
