import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireAccountMember } from "./lib/auth";
import {
  attachmentValidator,
  isAttachmentTypeAndSizeAllowed,
} from "./lib/validators";
import { logActivity } from "./lib/activity";
import {
  extractMentionStrings,
  resolveMentions,
  hasAllMention,
  getAllMentions,
} from "./lib/mentions";
import { ensureSubscribed } from "./subscriptions";
import {
  createMentionNotifications,
  createThreadNotifications,
} from "./lib/notifications";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Resolve attachment URLs at read time so clients always get fresh URLs
 * (stored URLs may be time-limited). Legacy attachments with only url are unchanged.
 */
async function resolveAttachmentUrls(
  ctx: QueryCtx,
  attachments: Doc<"messages">["attachments"],
): Promise<Doc<"messages">["attachments"]> {
  if (!attachments?.length) return attachments;
  return await Promise.all(
    attachments.map(async (a) => {
      const url = a.storageId
        ? await ctx.storage.getUrl(a.storageId)
        : (a.url ?? undefined);
      return { ...a, url: url ?? undefined };
    }),
  );
}

/**
 * List messages for a task thread.
 * Attachment URLs are resolved at read time for fresh, non-expiring links.
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
    // Resolve attachment URLs at read time so clients get fresh URLs
    const result = [];
    for (const msg of messages) {
      const attachments = await resolveAttachmentUrls(ctx, msg.attachments);
      result.push(attachments ? { ...msg, attachments } : msg);
    }
    return result;
  },
});

/**
 * Get a single message.
 * Attachment URLs are resolved at read time for fresh, non-expiring links.
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
    const attachments = await resolveAttachmentUrls(ctx, message.attachments);
    return attachments ? { ...message, attachments } : message;
  },
});

/**
 * Generate a short-lived upload URL for attaching a file to a message.
 * Caller must be a member of the task's account.
 */
export const generateUploadUrl = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    await requireAccountMember(ctx, task.accountId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Register a completed upload for a task so attachments can be scoped to the account.
 */
export const registerUpload = mutation({
  args: {
    taskId: v.id("tasks"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    const { userId, accountId } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) {
      throw new Error("Not found: Upload does not exist in storage");
    }

    const existing = await ctx.db
      .query("messageUploads")
      .withIndex("by_account_task_storage", (q) =>
        q
          .eq("accountId", accountId)
          .eq("taskId", args.taskId)
          .eq("storageId", args.storageId),
      )
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("messageUploads", {
      accountId,
      taskId: args.taskId,
      storageId: args.storageId,
      createdByType: "user",
      createdBy: userId,
      createdAt: Date.now(),
    });
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

    const { userId, userName, accountId } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    // Validate attachments using server-side storage metadata (not client-provided type/size)
    let resolvedAttachments:
      | Array<{
          storageId?: Id<"_storage">;
          name: string;
          type: string;
          size: number;
        }>
      | undefined;
    if (args.attachments?.length) {
      for (const a of args.attachments) {
        const upload = await ctx.db
          .query("messageUploads")
          .withIndex("by_account_task_storage", (q) =>
            q
              .eq("accountId", accountId)
              .eq("taskId", args.taskId)
              .eq("storageId", a.storageId),
          )
          .unique();
        if (!upload) {
          throw new Error(
            `Attachment "${a.name}": upload not registered for this task`,
          );
        }

        const meta = await ctx.db.system.get("_storage", a.storageId);
        if (!meta) {
          throw new Error(
            `Attachment "${a.name}": file not found in storage (upload may have failed)`,
          );
        }
        if (!meta.contentType) {
          throw new Error(
            `Attachment "${a.name}": missing content type on upload`,
          );
        }
        const type = meta.contentType;
        const size = meta.size;
        if (!isAttachmentTypeAndSizeAllowed(type, size, a.name)) {
          throw new Error(
            `Attachment "${a.name}": type or size not allowed (max 20MB, allowed types: images, PDF, .doc/.docx, .txt, .csv, .json)`,
          );
        }
        resolvedAttachments = resolvedAttachments ?? [];
        resolvedAttachments.push({
          storageId: a.storageId,
          name: a.name,
          type,
          size,
        });
      }
    }
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
      attachments: resolvedAttachments,
      createdAt: Date.now(),
    });

    // Auto-subscribe author to thread
    await ensureSubscribed(ctx, accountId, args.taskId, "user", userId);

    // Auto-subscribe mentioned entities
    for (const mention of mentions) {
      await ensureSubscribed(
        ctx,
        accountId,
        args.taskId,
        mention.type,
        mention.id,
      );
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
        hasAttachments: !!resolvedAttachments?.length,
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
        task.title,
      );
    }

    // Create thread update notifications
    const mentionedIds = new Set(mentions.map((m) => m.id));
    const hasAgentMentions = mentions.some(
      (mention) => mention.type === "agent",
    );
    await createThreadNotifications(
      ctx,
      accountId,
      args.taskId,
      messageId,
      "user",
      userId,
      userName,
      task.title,
      mentionedIds,
      hasAgentMentions,
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

    const { userId, membership } = await requireAccountMember(
      ctx,
      message.accountId,
    );

    const isAuthor =
      message.authorType === "user" && message.authorId === userId;
    const isAdminOrOwner =
      membership.role === "admin" || membership.role === "owner";

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
