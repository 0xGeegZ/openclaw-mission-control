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
        q
          .eq("accountId", args.accountId)
          .eq("recipientType", "agent")
          .eq("deliveredAt", undefined),
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
    let sourceNotificationType: string | null = null;
    if (message?.sourceNotificationId) {
      const sourceNotification = await ctx.db.get(message.sourceNotificationId);
      sourceNotificationType = sourceNotification?.type ?? null;
    }

    let thread: {
      messageId: Id<"messages">;
      authorType: "user" | "agent";
      authorId: string;
      authorName: string | null;
      content: string;
      createdAt: number;
    }[] = [];
    const taskId = notification.taskId;
    if (taskId) {
      const threadMessages = await ctx.db
        .query("messages")
        .withIndex("by_task_created", (q) => q.eq("taskId", taskId))
        .order("asc")
        .collect();

      const userIds = new Set<string>();
      const agentIds = new Set<string>();
      for (const msg of threadMessages) {
        if (msg.authorType === "user") {
          userIds.add(msg.authorId);
        } else {
          agentIds.add(msg.authorId);
        }
      }

      const userNames = new Map<string, string>();
      if (userIds.size > 0) {
        const memberships = await ctx.db
          .query("memberships")
          .withIndex("by_account", (q) =>
            q.eq("accountId", notification.accountId),
          )
          .collect();
        for (const membership of memberships) {
          if (userIds.has(membership.userId)) {
            userNames.set(membership.userId, membership.userName);
          }
        }
      }

      const agentNames = new Map<string, string>();
      if (agentIds.size > 0) {
        const agents = await ctx.db
          .query("agents")
          .withIndex("by_account", (q) =>
            q.eq("accountId", notification.accountId),
          )
          .collect();
        for (const agent of agents) {
          if (agentIds.has(agent._id)) {
            agentNames.set(agent._id, agent.name);
          }
        }
      }

      thread = threadMessages.map((msg) => {
        const authorName =
          msg.authorType === "user"
            ? (userNames.get(msg.authorId) ?? null)
            : (agentNames.get(msg.authorId) ?? null);
        return {
          messageId: msg._id,
          authorType: msg.authorType,
          authorId: msg.authorId,
          authorName,
          content: msg.content,
          createdAt: msg.createdAt,
        };
      });
    }

    const referenceDocs = await ctx.db
      .query("documents")
      .withIndex("by_account_type", (q) =>
        q.eq("accountId", notification.accountId).eq("type", "reference"),
      )
      .collect();
    const repositoryDoc = referenceDocs.find(
      (doc) =>
        doc.title === "Repository — Primary" ||
        doc.name === "Repository — Primary",
    );

    const account = await ctx.db.get(notification.accountId);
    const orchestratorAgentId = (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)?.orchestratorAgentId ?? null;

    return {
      notification,
      agent,
      task,
      message,
      thread,
      sourceNotificationType,
      orchestratorAgentId,
      repositoryDoc: repositoryDoc
        ? {
            title:
              repositoryDoc.title ??
              repositoryDoc.name ??
              "Repository — Primary",
            content: repositoryDoc.content ?? "",
          }
        : null,
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
