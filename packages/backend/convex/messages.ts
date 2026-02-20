import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAccountMember } from "./lib/auth";
import {
  attachmentValidator,
  isAttachmentTypeAndSizeAllowed,
  MESSAGE_CONTENT_MAX_LENGTH,
} from "./lib/validators";
import { logActivity } from "./lib/activity";
import { resolveMentions, hasAllMention, getAllMentions } from "./lib/mentions";
import { ensureSubscribed } from "./subscriptions";
import {
  createMentionNotifications,
  createThreadNotifications,
} from "./lib/notifications";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { checkQuota, incrementUsage } from "./lib/quotaHelpers";

const ORCHESTRATOR_CHAT_LABEL = "system:orchestrator-chat";

/**
 * Check whether a task is the account's orchestrator chat thread.
 */
function isOrchestratorChatTask(params: {
  account: Doc<"accounts"> | null;
  task: Doc<"tasks">;
}): boolean {
  const { account, task } = params;
  if (task.labels?.includes(ORCHESTRATOR_CHAT_LABEL)) return true;
  const settings = account?.settings as
    | { orchestratorChatTaskId?: Id<"tasks"> }
    | undefined;
  return settings?.orchestratorChatTaskId === task._id;
}

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
 * Generate a Convex storage upload URL for message attachments.
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
 * Register a storage blob as an allowed attachment for a task.
 * Validates membership so only authorized users can attach files to the task.
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
    await requireAccountMember(ctx, task.accountId);
    return undefined;
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

    const { userId, userName, accountId } = await requireAccountMember(
      ctx,
      task.accountId,
    );
    const account = await ctx.db.get(accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    // Check message quota before proceeding
    const quotaCheck = await checkQuota(ctx, accountId, "messages");
    if (!quotaCheck.allowed) {
      throw new Error(
        `Quota exceeded: ${quotaCheck.message}. Upgrade your plan to send more messages.`,
      );
    }

    const isOrchestratorChat = isOrchestratorChatTask({ account, task });
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;

    if (args.content.length > MESSAGE_CONTENT_MAX_LENGTH) {
      throw new Error(
        `Message content too long (max ${MESSAGE_CONTENT_MAX_LENGTH} characters)`,
      );
    }

    // Validate attachments against storage metadata (type/size), not client-provided values
    if (args.attachments?.length) {
      for (const a of args.attachments) {
        const meta = await ctx.db.system.get("_storage", a.storageId);
        if (!meta) {
          throw new Error(
            `Attachment "${a.name}": file not found in storage (upload may have failed)`,
          );
        }
        const type = meta.contentType ?? a.type;
        const size = meta.size ?? a.size;
        if (!isAttachmentTypeAndSizeAllowed(type, size, a.name)) {
          throw new Error(
            `Attachment "${a.name}": type or size not allowed (max 20MB, allowed types: images, PDF, .doc/.docx, .txt, .csv, .json)`,
          );
        }
      }
    }

    // Parse and resolve mentions
    let mentions;

    if (hasAllMention(args.content)) {
      // @all - mention everyone except author
      mentions = await getAllMentions(ctx, accountId, userId);
    } else {
      // Resolve specific mentions
      mentions = await resolveMentions(ctx, accountId, {
        content: args.content,
      });
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

    // Increment message quota usage after successful insert
    await incrementUsage(ctx, accountId, "messages");

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
        task.title,
      );
    }

    // Create thread update notifications (pass orchestrator chat options so Lead is notified)
    const mentionedIds = new Set(mentions.map((m) => m.id));
    const hasAgentMentions = mentions.some((m) => m.type === "agent");
    const account = await ctx.db.get(task.accountId);
    const settings = account?.settings as
      | {
          orchestratorChatTaskId?: Id<"tasks">;
          orchestratorAgentId?: Id<"agents">;
        }
      | undefined;
    const isOrchestratorChat =
      task.labels?.includes("system:orchestrator-chat") === true ||
      settings?.orchestratorChatTaskId === args.taskId;
    const threadOptions =
      isOrchestratorChat && settings?.orchestratorAgentId
        ? {
            isOrchestratorChat: true,
            orchestratorAgentId: settings.orchestratorAgentId,
          }
        : undefined;
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
      task.status,
      threadOptions,
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

    if (args.content.length > MESSAGE_CONTENT_MAX_LENGTH) {
      throw new Error(
        `Message content too long (max ${MESSAGE_CONTENT_MAX_LENGTH} characters)`,
      );
    }

    // Re-parse mentions from new content
    let mentions;

    if (hasAllMention(args.content)) {
      mentions = await getAllMentions(ctx, message.accountId, userId);
    } else {
      mentions = await resolveMentions(ctx, message.accountId, {
        content: args.content,
      });
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

    const { userId } = await requireAccountMember(ctx, message.accountId);

    // Only author can delete (or admin - could add later)
    if (message.authorType !== "user" || message.authorId !== userId) {
      throw new Error("Forbidden: Only author can delete message");
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
