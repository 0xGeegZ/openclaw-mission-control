import { v } from "convex/values";
import {
  internalQuery,
  internalMutation,
  type DatabaseReader,
} from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  resolveBehaviorFlags,
  type BehaviorFlags,
} from "../lib/behavior_flags";

/**
 * Return type of getForDelivery. Used by service actions and runtime for type-safe delivery context.
 */
export interface GetForDeliveryResult {
  notification: Doc<"notifications">;
  agent: Doc<"agents"> | null;
  task: Doc<"tasks"> | null;
  message: Doc<"messages"> | null;
  thread: Array<{
    messageId: Id<"messages">;
    authorType: "user" | "agent";
    authorId: string;
    authorName: string | null;
    content: string;
    createdAt: number;
  }>;
  sourceNotificationType: string | null;
  orchestratorAgentId: Id<"agents"> | null;
  primaryUserMention: { id: string; name: string; email: string | null } | null;
  mentionableAgents: Array<{
    id: string;
    slug: string;
    name: string;
    role: string;
  }>;
  assignedAgents: Array<{
    id: string;
    slug: string;
    name: string;
    role: string;
  }>;
  effectiveBehaviorFlags: BehaviorFlags;
  repositoryDoc: { title: string; content: string } | null;
  globalBriefingDoc: { title: string; content: string } | null;
  taskOverview: {
    totals: Array<{ status: string; count: number }>;
    topTasks: Array<{
      status: string;
      tasks: Array<{
        taskId: Id<"tasks">;
        title: string;
        status: string;
        priority: number;
        assignedAgentIds: Array<Id<"agents">>;
        assignedUserIds: string[];
      }>;
    }>;
  } | null;
}

const TASK_OVERVIEW_STATUSES = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "blocked",
] as const;
const TASK_OVERVIEW_LIMIT = 3;
const TASK_OVERVIEW_SCAN_LIMIT = 100;
const ORCHESTRATOR_CHAT_LABEL = "system:orchestrator-chat";
const RESPONSE_REQUEST_RETRY_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/**
 * Build a compact task overview for orchestrator prompts.
 */
async function buildTaskOverview(
  ctx: { db: DatabaseReader },
  accountId: Id<"accounts">,
): Promise<NonNullable<GetForDeliveryResult["taskOverview"]>> {
  const totals: Array<{ status: string; count: number }> = [];
  const topTasks: Array<{
    status: string;
    tasks: Array<{
      taskId: Id<"tasks">;
      title: string;
      status: string;
      priority: number;
      assignedAgentIds: Array<Id<"agents">>;
      assignedUserIds: string[];
    }>;
  }> = [];

  for (const status of TASK_OVERVIEW_STATUSES) {
    const tasks: Doc<"tasks">[] = await ctx.db
      .query("tasks")
      .withIndex("by_account_status", (q) =>
        q.eq("accountId", accountId).eq("status", status),
      )
      .order("desc")
      .take(TASK_OVERVIEW_SCAN_LIMIT);

    const filteredTasks = tasks.filter(
      (task) => !task.labels?.includes(ORCHESTRATOR_CHAT_LABEL),
    );

    filteredTasks.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.createdAt - a.createdAt;
    });

    totals.push({ status, count: filteredTasks.length });
    topTasks.push({
      status,
      tasks: filteredTasks.slice(0, TASK_OVERVIEW_LIMIT).map((task) => ({
        taskId: task._id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        assignedAgentIds: task.assignedAgentIds,
        assignedUserIds: task.assignedUserIds,
      })),
    });
  }

  return { totals, topTasks };
}

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
  handler: async (ctx, args): Promise<Doc<"notifications">[]> => {
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
 * Mark a notification as read (service-only).
 * Called by runtime when it starts processing a notification (before sendToOpenClaw).
 * Idempotent: if readAt is already set, does nothing.
 */
export const markRead = internalMutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error("Not found: Notification does not exist");
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
  handler: async (ctx, args): Promise<GetForDeliveryResult | null> => {
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

    let primaryUserId: string | null = null;
    const userNames = new Map<string, string>();
    const userEmails = new Map<string, string>();

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

      for (let i = threadMessages.length - 1; i >= 0; i--) {
        if (threadMessages[i].authorType === "user") {
          primaryUserId = threadMessages[i].authorId;
          break;
        }
      }

      const userIds = new Set<string>();
      const agentIds = new Set<string>();
      for (const msg of threadMessages) {
        if (msg.authorType === "user") {
          userIds.add(msg.authorId);
        } else {
          agentIds.add(msg.authorId);
        }
      }

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
            userEmails.set(membership.userId, membership.userEmail);
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
    const briefingDoc = referenceDocs.find(
      (doc) =>
        doc.title === "Account Briefing" || doc.name === "Account Briefing",
    );

    const account = await ctx.db.get(notification.accountId);
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    const orchestratorChatTaskId =
      (
        account?.settings as
          | { orchestratorChatTaskId?: Id<"tasks"> }
          | undefined
      )?.orchestratorChatTaskId ?? null;
    const shouldIncludeOrchestratorContext =
      notification.taskId != null &&
      orchestratorChatTaskId != null &&
      notification.taskId === orchestratorChatTaskId;
    const taskOverview = shouldIncludeOrchestratorContext
      ? await buildTaskOverview(ctx, notification.accountId)
      : null;
    const globalBriefingDoc =
      shouldIncludeOrchestratorContext && briefingDoc
        ? {
            title: briefingDoc.title ?? briefingDoc.name ?? "Account Briefing",
            content: briefingDoc.content ?? "",
          }
        : null;

    if (!primaryUserId && task?.createdBy) {
      primaryUserId = task.createdBy;
    }

    let primaryUserMention: {
      id: string;
      name: string;
      email: string | null;
    } | null = null;
    if (primaryUserId) {
      let name = userNames.get(primaryUserId) ?? null;
      let email = userEmails.get(primaryUserId) ?? null;
      if (!name) {
        const membership = await ctx.db
          .query("memberships")
          .withIndex("by_account_user", (q) =>
            q
              .eq("accountId", notification.accountId)
              .eq("userId", primaryUserId),
          )
          .unique();
        if (membership) {
          name = membership.userName;
          email = membership.userEmail;
        }
      }
      if (name) {
        primaryUserMention = { id: primaryUserId, name, email };
      }
    }

    const accountAgents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", notification.accountId))
      .collect();

    const mentionableAgents = accountAgents
      .map((a) => ({
        id: a._id,
        slug: a.slug ?? "",
        name: a.name,
        role: a.role ?? "Unknown",
      }))
      .sort((a, b) =>
        (a.slug || a.name).localeCompare(b.slug || b.name, undefined, {
          sensitivity: "base",
        }),
      );

    const assignedAgentIds = task?.assignedAgentIds ?? [];
    const assignedIdsSet = new Set(assignedAgentIds);
    const assignedAgents = mentionableAgents.filter((a) =>
      assignedIdsSet.has(a.id),
    );

    const effectiveBehaviorFlags = resolveBehaviorFlags(agent, account);

    return {
      notification,
      agent,
      task,
      message,
      thread,
      sourceNotificationType,
      orchestratorAgentId,
      primaryUserMention,
      mentionableAgents,
      assignedAgents,
      effectiveBehaviorFlags,
      repositoryDoc: repositoryDoc
        ? {
            title:
              repositoryDoc.title ??
              repositoryDoc.name ??
              "Repository — Primary",
            content: repositoryDoc.content ?? "",
          }
        : null,
      globalBriefingDoc,
      taskOverview,
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

/**
 * Decide whether a fresh response_request should be created for a recipient.
 * Retries are allowed when:
 * - the recipient already replied after the latest request, or
 * - the latest request was delivered and has exceeded the retry cooldown.
 *
 * Retries are blocked while the latest request is still undelivered.
 */
export function shouldCreateResponseRequestRetry(options: {
  latestRequestCreatedAt: number;
  latestRequestDeliveredAt: number | undefined;
  latestReplyCreatedAt: number | undefined;
  nowMs: number;
  retryCooldownMs?: number;
}): boolean {
  const {
    latestRequestCreatedAt,
    latestRequestDeliveredAt,
    latestReplyCreatedAt,
    nowMs,
    retryCooldownMs = RESPONSE_REQUEST_RETRY_COOLDOWN_MS,
  } = options;

  if (
    latestReplyCreatedAt != null &&
    latestReplyCreatedAt > latestRequestCreatedAt
  ) {
    return true;
  }

  if (latestRequestDeliveredAt == null) {
    return false;
  }

  return nowMs - latestRequestCreatedAt >= retryCooldownMs;
}

/**
 * Create response_request notifications with per-recipient dedupe.
 * Dedupe rule: if the latest response_request for (taskId, recipientId) exists
 * and the recipient has not posted a newer agent message on the task, skip creating.
 */
export const createResponseRequestNotificationsInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    requesterAgentId: v.id("agents"),
    taskId: v.id("tasks"),
    recipientAgentIds: v.array(v.id("agents")),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"notifications">[]> => {
    const notificationIds: Id<"notifications">[] = [];
    const now = Date.now();
    const requester = await ctx.db.get(args.requesterAgentId);
    const task = await ctx.db.get(args.taskId);
    if (!requester || !task) return notificationIds;
    if (requester.accountId !== args.accountId) return notificationIds;
    if (task.accountId !== args.accountId) return notificationIds;

    for (const recipientId of args.recipientAgentIds) {
      const recipient = await ctx.db.get(recipientId);
      if (!recipient || recipient.accountId !== args.accountId) continue;

      const latestRequest = await ctx.db
        .query("notifications")
        .withIndex("by_task_recipient_id_created", (q) =>
          q.eq("taskId", args.taskId).eq("recipientId", recipientId),
        )
        .order("desc")
        .filter((q) =>
          q.and(
            q.eq(q.field("type"), "response_request"),
            q.eq(q.field("accountId"), args.accountId),
            q.eq(q.field("recipientType"), "agent"),
          ),
        )
        .first();

      if (latestRequest) {
        const latestReply = await ctx.db
          .query("messages")
          .withIndex("by_task_author_created", (q) =>
            q
              .eq("taskId", args.taskId)
              .eq("authorType", "agent")
              .eq("authorId", recipientId),
          )
          .order("desc")
          .first();

        const allowRetry = shouldCreateResponseRequestRetry({
          latestRequestCreatedAt: latestRequest.createdAt,
          latestRequestDeliveredAt: latestRequest.deliveredAt,
          latestReplyCreatedAt: latestReply?.createdAt,
          nowMs: now,
        });
        if (!allowRetry) {
          continue;
        }
      }

      const notificationId = await ctx.db.insert("notifications", {
        accountId: args.accountId,
        type: "response_request",
        recipientType: "agent",
        recipientId,
        taskId: args.taskId,
        title: `${requester.name} requested a response`,
        body: args.message,
        createdAt: now,
      });
      notificationIds.push(notificationId);
    }

    return notificationIds;
  },
});
