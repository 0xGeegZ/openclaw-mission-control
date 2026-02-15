import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
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
  resolveMentions,
  hasAllMention,
  getAllMentions,
} from "../lib/mentions";
import type { ParsedMention } from "../lib/mentions";
import {
  createMentionNotifications,
  createThreadNotifications,
} from "../lib/notifications";

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
    const account = await ctx.db.get(agent.accountId);
    const isOrchestratorChat = isOrchestratorChatTask({ account, task });
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;

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
 * List thread messages for agent tools (internal, service-only).
 */
export const listThreadForTool = internalQuery({
  args: {
    accountId: v.id("accounts"),
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.accountId !== args.accountId) {
      return [];
    }

    const limit = Math.min(args.limit ?? 50, 200);
    const threadMessages = await ctx.db
      .query("messages")
      .withIndex("by_task_created", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(limit);

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
        .withIndex("by_account", (q) => q.eq("accountId", task.accountId))
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
        .withIndex("by_account", (q) => q.eq("accountId", task.accountId))
        .collect();
      for (const agent of agents) {
        if (agentIds.has(agent._id)) {
          agentNames.set(agent._id, agent.name);
        }
      }
    }

    return threadMessages.reverse().map((msg) => ({
      messageId: msg._id,
      authorType: msg.authorType,
      authorId: msg.authorId,
      authorName:
        msg.authorType === "user"
          ? (userNames.get(msg.authorId) ?? null)
          : (agentNames.get(msg.authorId) ?? null),
      content: msg.content,
      createdAt: msg.createdAt,
    }));
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
    /** When true, suppress agent notifications for this message (prevents reply loops). */
    suppressAgentNotifications: v.optional(v.boolean()),
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
    const account = await ctx.db.get(agent.accountId);
    const isOrchestratorChat = isOrchestratorChatTask({ account, task });
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;

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
    let mentions: ParsedMention[];
    if (isOrchestratorChat) {
      mentions = [];
    } else if (hasAllMention(args.content)) {
      mentions = await getAllMentions(ctx, agent.accountId, args.agentId);
    } else {
      mentions = await resolveMentions(ctx, agent.accountId, {
        content: args.content,
      });
    }

    const suppressAgentNotifications = args.suppressAgentNotifications === true;
    const allowAgentMentionsForNotifications =
      args.allowAgentMentions && !suppressAgentNotifications;
    const mentionsForNotifications = isOrchestratorChat
      ? []
      : allowAgentMentionsForNotifications
        ? mentions
        : mentions.filter((m) => m.type === "user");

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      accountId: agent.accountId,
      taskId: args.taskId,
      authorType: "agent",
      authorId: args.agentId,
      content: args.content,
      mentions,
      attachments: resolvedAttachments,
      createdAt: now,
      sourceNotificationId: args.sourceNotificationId,
    });

    await ctx.db.patch(args.taskId, {
      updatedAt: now,
      lastMessageAt: now,
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
    const hasAgentMentions =
      allowAgentMentionsForNotifications &&
      mentions.some((mention) => mention.type === "agent");
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
      {
        isOrchestratorChat,
        orchestratorAgentId,
        suppressAgentNotifications,
      },
    );

    return messageId;
  },
});
