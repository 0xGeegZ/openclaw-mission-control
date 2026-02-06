import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import {
  attachmentValidator,
  isAttachmentTypeAndSizeAllowed,
} from "../lib/validators";
import { logActivity } from "../lib/activity";
import {
  ensureSubscribed,
  ensureOrchestratorSubscribed,
} from "../subscriptions";
import {
  extractMentionStrings,
  resolveMentions,
  hasAllMention,
  getAllMentions,
} from "../lib/mentions";
import {
  createMentionNotifications,
  createThreadNotifications,
} from "../lib/notifications";

/**
 * Register a completed upload for a task on behalf of an agent.
 */
export const registerUploadFromAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    if (task.accountId !== agent.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) {
      throw new Error("Not found: Upload does not exist in storage");
    }

    const existing = await ctx.db
      .query("messageUploads")
      .withIndex("by_account_task_storage", (q) =>
        q
          .eq("accountId", agent.accountId)
          .eq("taskId", args.taskId)
          .eq("storageId", args.storageId),
      )
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("messageUploads", {
      accountId: agent.accountId,
      taskId: args.taskId,
      storageId: args.storageId,
      createdByType: "agent",
      createdBy: args.agentId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Create a message from an agent.
 * Called by runtime when agent posts to a thread.
 * When sourceNotificationId is provided, returns existing message id if one already exists (idempotency).
 */
export const createFromAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
    sourceNotificationId: v.optional(v.id("notifications")),
    /** When false, agent mentions are excluded from notifications/subscriptions; message content is unchanged. */
    allowAgentMentions: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Get agent info
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    // Get task info
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    // Verify same account
    if (task.accountId !== agent.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    // Idempotency: if we already have a message for this notification, return it
    if (args.sourceNotificationId) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_source_notification", (q) =>
          q.eq("sourceNotificationId", args.sourceNotificationId!),
        )
        .first();
      if (existing) {
        return existing._id;
      }
    }

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
              .eq("accountId", agent.accountId)
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
    // Parse and resolve mentions. Store full list for display; use filtered list for notifications when agent mentions disallowed.
    let mentions: Array<{ type: "user" | "agent"; id: string; name: string }>;

    if (hasAllMention(args.content)) {
      mentions = await getAllMentions(ctx, agent.accountId, args.agentId);
    } else {
      const mentionStrings = extractMentionStrings(args.content);
      mentions = await resolveMentions(ctx, agent.accountId, mentionStrings);
    }

    const mentionsForNotifications = args.allowAgentMentions
      ? mentions
      : mentions.filter((m) => m.type === "user");

    // Create message (store full mentions so UI can render @squad-lead etc. as badges)
    const messageId = await ctx.db.insert("messages", {
      accountId: agent.accountId,
      taskId: args.taskId,
      authorType: "agent",
      authorId: args.agentId,
      content: args.content,
      mentions,
      attachments: resolvedAttachments,
      createdAt: Date.now(),
      sourceNotificationId: args.sourceNotificationId,
    });

    // Auto-subscribe agent to thread
    await ensureSubscribed(
      ctx,
      agent.accountId,
      args.taskId,
      "agent",
      args.agentId,
    );

    // Auto-subscribe mentioned entities (only those we actually notify)
    for (const mention of mentionsForNotifications) {
      await ensureSubscribed(
        ctx,
        agent.accountId,
        args.taskId,
        mention.type,
        mention.id,
      );
    }

    // Log activity
    await logActivity({
      ctx,
      accountId: agent.accountId,
      type: "message_created",
      actorType: "agent",
      actorId: args.agentId,
      actorName: agent.name,
      targetType: "message",
      targetId: messageId,
      targetName: task.title,
      meta: {
        taskId: args.taskId,
        mentionCount: mentions.length,
      },
    });

    // Create mention notifications (only for entities we allow to be mentioned by agents)
    if (mentionsForNotifications.length > 0) {
      await createMentionNotifications(
        ctx,
        agent.accountId,
        args.taskId,
        messageId,
        mentionsForNotifications,
        agent.name,
        task.title,
      );
    }

    await ensureOrchestratorSubscribed(ctx, agent.accountId, args.taskId);

    // Create thread update notifications
    const mentionedIds = new Set(mentionsForNotifications.map((m) => m.id));
    const hasAgentMentions = mentionsForNotifications.some(
      (mention) => mention.type === "agent",
    );
    await createThreadNotifications(
      ctx,
      agent.accountId,
      args.taskId,
      messageId,
      "agent",
      args.agentId,
      agent.name,
      task.title,
      mentionedIds,
      hasAgentMentions,
      task.status,
    );

    return messageId;
  },
});
