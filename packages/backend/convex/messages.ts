import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { attachmentValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";
import { 
  extractMentionStrings, 
  resolveMentions, 
  hasAllMention,
  getAllMentions,
} from "./lib/mentions";
import { ensureSubscribed } from "./subscriptions";
import { createMentionNotifications, createThreadNotifications } from "./lib/notifications";

/**
 * List messages for a task thread.
 */
export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return [];
    }
    
    await requireAccountMember(ctx, task.accountId);
    
    let messages = await ctx.db
      .query("messages")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    // Sort by created (oldest first for chat)
    messages.sort((a, b) => a.createdAt - b.createdAt);
    
    // Apply limit (from end for most recent)
    if (args.limit && messages.length > args.limit) {
      messages = messages.slice(-args.limit);
    }
    
    return messages;
  },
});

/**
 * Get a single message.
 */
export const get = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      return null;
    }
    
    await requireAccountMember(ctx, message.accountId);
    return message;
  },
});

/**
 * Create a new message in a task thread.
 */
export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    const { userId, userName, accountId } = await requireAccountMember(ctx, task.accountId);
    
    // Parse and resolve mentions
    let mentions;
    
    if (hasAllMention(args.content)) {
      // @all - mention everyone except author
      mentions = await getAllMentions(ctx, accountId, userId);
    } else {
      // Resolve specific mentions
      const mentionStrings = extractMentionStrings(args.content);
      mentions = await resolveMentions(ctx, accountId, mentionStrings);
    }
    
    // Create message
    const messageId = await ctx.db.insert("messages", {
      accountId,
      taskId: args.taskId,
      authorType: "user",
      authorId: userId,
      content: args.content,
      mentions,
      attachments: args.attachments,
      createdAt: Date.now(),
    });
    
    // Auto-subscribe author to thread
    await ensureSubscribed(ctx, accountId, args.taskId, "user", userId);
    
    // Auto-subscribe mentioned entities
    for (const mention of mentions) {
      await ensureSubscribed(ctx, accountId, args.taskId, mention.type, mention.id);
    }
    
    // Log activity
    await logActivity({
      ctx,
      accountId,
      type: "message_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "message",
      targetId: messageId,
      targetName: task.title,
      meta: { 
        taskId: args.taskId,
        mentionCount: mentions.length,
        hasAttachments: !!args.attachments?.length,
      },
    });
    
    // Create mention notifications
    if (mentions.length > 0) {
      await createMentionNotifications(
        ctx,
        accountId,
        args.taskId,
        messageId,
        mentions,
        userName,
        task.title
      );
    }
    
    // Create thread update notifications
    const mentionedIds = new Set(mentions.map(m => m.id));
    await createThreadNotifications(
      ctx,
      accountId,
      args.taskId,
      messageId,
      "user",
      userId,
      userName,
      task.title,
      mentionedIds
    );
    
    return messageId;
  },
});

/**
 * Update a message (edit).
 */
export const update = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Not found: Message does not exist");
    }
    
    const { userId } = await requireAccountMember(ctx, message.accountId);
    
    // Only author can edit
    if (message.authorType !== "user" || message.authorId !== userId) {
      throw new Error("Forbidden: Only author can edit message");
    }
    
    // Re-parse mentions from new content
    let mentions;
    
    if (hasAllMention(args.content)) {
      mentions = await getAllMentions(ctx, message.accountId, userId);
    } else {
      const mentionStrings = extractMentionStrings(args.content);
      mentions = await resolveMentions(ctx, message.accountId, mentionStrings);
    }
    
    await ctx.db.patch(args.messageId, {
      content: args.content,
      mentions,
      editedAt: Date.now(),
    });
    
    return args.messageId;
  },
});

/**
 * Delete a message.
 * Authors can delete their own messages.
 * Admins and owners can delete any message.
 */
export const remove = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Not found: Message does not exist");
    }
    
    const { userId, membership } = await requireAccountMember(ctx, message.accountId);
    
    const isAuthor = message.authorType === "user" && message.authorId === userId;
    const isAdminOrOwner = membership.role === "admin" || membership.role === "owner";
    
    // Allow deletion if author OR if admin/owner
    if (!isAuthor && !isAdminOrOwner) {
      throw new Error("Forbidden: Only author or admin can delete message");
    }
    
    await ctx.db.delete(args.messageId);
    
    return true;
  },
});

/**
 * Get message count for a task.
 */
export const getCount = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    
    return messages.length;
  },
});
