import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ParsedMention } from "./mentions";
import type { RecipientType } from "@packages/shared";

/** Notification preference category. When false, user notifications in that category are skipped (unless forceCreate). */
export type NotificationPreferenceCategory =
  | "taskUpdates"
  | "agentActivity"
  | "memberUpdates";

/**
 * Check whether to create a user notification based on account preferences.
 * When forceCreate is true (e.g. mandatory system alerts), skip preference check.
 */
export async function shouldCreateUserNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  category: NotificationPreferenceCategory,
  options?: { forceCreate?: boolean },
): Promise<boolean> {
  if (options?.forceCreate) return true;
  const account = await ctx.db.get(accountId);
  if (!account) return false;
  const prefs = (
    account as {
      settings?: { notificationPreferences?: Record<string, boolean> };
    }
  ).settings?.notificationPreferences;
  if (!prefs) return true; // default: create
  const value = prefs[category];
  return value !== false; // undefined or true => create
}

/**
 * Create notifications for mentions.
 * Called after a message is created with mentions.
 * Respects account notificationPreferences.agentActivity for user recipients.
 */
export async function createMentionNotifications(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  messageId: Id<"messages">,
  mentions: ParsedMention[],
  authorName: string,
  taskTitle: string,
): Promise<Id<"notifications">[]> {
  const notificationIds: Id<"notifications">[] = [];
  for (const mention of mentions) {
    if (
      mention.type === "user" &&
      !(await shouldCreateUserNotification(ctx, accountId, "agentActivity"))
    ) {
      continue;
    }
    const notificationId = await ctx.db.insert("notifications", {
      accountId,
      type: "mention",
      recipientType: mention.type,
      recipientId: mention.id,
      taskId,
      messageId,
      title: `${authorName} mentioned you`,
      body: `You were mentioned in task "${taskTitle}"`,
      createdAt: Date.now(),
    });
    notificationIds.push(notificationId);
  }
  return notificationIds;
}

interface ThreadUpdateCandidate {
  id: Id<"notifications">;
  createdAt: number;
}

/**
 * Build latest undelivered thread_update candidate per agent recipient for one task.
 * The map key is recipientId; when duplicates exist, keeps the most recent one.
 * @param ctx - Convex mutation context.
 * @param accountId - Account ID (tenant isolation).
 * @param taskId - Task ID (indexed).
 * @returns Recipient map with latest undelivered notification id and createdAt.
 */
async function buildUndeliveredAgentThreadUpdateMap(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
): Promise<Map<string, ThreadUpdateCandidate>> {
  const allForTask = await ctx.db
    .query("notifications")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  const byRecipient = new Map<string, ThreadUpdateCandidate>();
  for (const notification of allForTask) {
    if (notification.accountId !== accountId) continue;
    if (notification.type !== "thread_update") continue;
    if (notification.recipientType !== "agent") continue;
    if (notification.deliveredAt !== undefined) continue;
    if (!notification.recipientId || !notification.recipientId.trim()) continue;

    const previous = byRecipient.get(notification.recipientId);
    const isNewer = !previous || notification.createdAt >= previous.createdAt;
    if (isNewer) {
      byRecipient.set(notification.recipientId, {
        id: notification._id,
        createdAt: notification.createdAt,
      });
    }
  }
  return byRecipient;
}

/**
 * Create notifications for thread subscribers.
 * Called after a message is created, excluding author and already-mentioned.
 * Respects account notificationPreferences.agentActivity for user recipients.
 * When an agent is explicitly mentioned, skip thread_update notifications for agents
 * to avoid multiple agent replies.
 * If taskStatus is done/blocked, skip agent thread_update notifications to avoid
 * reply storms when humans post in completed tasks.
 * For agent recipients, coalesces with an existing undelivered thread_update for the same
 * (taskId, recipientId): patches that notification with the latest messageId/title/body/createdAt
 * instead of inserting a new row.
 * @param ctx - Convex mutation context.
 * @param accountId - Account ID.
 * @param taskId - Task ID.
 * @param messageId - New message ID (and for coalesced row, updated messageId).
 * @param authorType - Author type (user | agent).
 * @param authorId - Author ID (skipped as subscriber).
 * @param authorName - Display name for title/body.
 * @param taskTitle - Task title for body.
 * @param mentionedIds - Subscriber IDs to skip (already mentioned).
 * @param hasAgentMentions - When true, skip agent thread_update to avoid duplicate replies.
 * @param taskStatus - When done/blocked, skip agent thread_update.
 * @param options - Orchestrator chat filter and suppressAgentNotifications.
 * @returns Array of notification IDs (inserted or coalesced).
 */
export async function createThreadNotifications(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  messageId: Id<"messages">,
  authorType: RecipientType,
  authorId: string,
  authorName: string,
  taskTitle: string,
  mentionedIds: Set<string>,
  hasAgentMentions: boolean,
  taskStatus?: string,
  options?: {
    isOrchestratorChat?: boolean;
    orchestratorAgentId?: Id<"agents"> | null;
    /** When true, suppress agent thread_update notifications for this message. */
    suppressAgentNotifications?: boolean;
  },
): Promise<Id<"notifications">[]> {
  const shouldSkipAgentThreadUpdates =
    taskStatus === "done" || taskStatus === "blocked";
  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  const notificationIds: Id<"notifications">[] = [];
  const now = Date.now();
  const title = `${authorName} replied`;
  const body = `New message in task "${taskTitle}"`;
  const undeliveredThreadUpdatesByRecipient =
    await buildUndeliveredAgentThreadUpdateMap(ctx, accountId, taskId);

  for (const subscription of subscriptions) {
    if (
      options?.isOrchestratorChat &&
      subscription.subscriberType === "agent"
    ) {
      if (
        !options.orchestratorAgentId ||
        subscription.subscriberId !== options.orchestratorAgentId
      ) {
        continue;
      }
    }
    if (
      (shouldSkipAgentThreadUpdates ||
        options?.suppressAgentNotifications === true) &&
      subscription.subscriberType === "agent"
    )
      continue;
    // When user mentions agents, skip thread_update for other agents but still notify orchestrator in orchestrator chat
    if (hasAgentMentions && subscription.subscriberType === "agent") {
      const isOrchestrator =
        options?.isOrchestratorChat &&
        options?.orchestratorAgentId &&
        subscription.subscriberId === options.orchestratorAgentId;
      if (!isOrchestrator) continue;
    }
    if (
      subscription.subscriberType === authorType &&
      subscription.subscriberId === authorId
    )
      continue;
    if (mentionedIds.has(subscription.subscriberId)) continue;
    if (
      subscription.subscriberType === "user" &&
      !(await shouldCreateUserNotification(ctx, accountId, "agentActivity"))
    ) {
      continue;
    }

    if (subscription.subscriberType === "agent") {
      const existing = undeliveredThreadUpdatesByRecipient.get(
        subscription.subscriberId,
      );
      if (existing) {
        await ctx.db.patch(existing.id, {
          messageId,
          title,
          body,
          createdAt: now,
        });
        notificationIds.push(existing.id);
        undeliveredThreadUpdatesByRecipient.set(subscription.subscriberId, {
          id: existing.id,
          createdAt: now,
        });
        continue;
      }
    }

    const notificationId = await ctx.db.insert("notifications", {
      accountId,
      type: "thread_update",
      recipientType: subscription.subscriberType,
      recipientId: subscription.subscriberId,
      taskId,
      messageId,
      title,
      body,
      createdAt: now,
    });
    notificationIds.push(notificationId);
    if (subscription.subscriberType === "agent") {
      undeliveredThreadUpdatesByRecipient.set(subscription.subscriberId, {
        id: notificationId,
        createdAt: now,
      });
    }
  }
  return notificationIds;
}

/**
 * Create notification for task assignment.
 * Respects account notificationPreferences.taskUpdates for user recipients. Returns null when skipped.
 */
export async function createAssignmentNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  recipientType: RecipientType,
  recipientId: string,
  assignerName: string,
  taskTitle: string,
): Promise<Id<"notifications"> | null> {
  if (
    recipientType === "user" &&
    !(await shouldCreateUserNotification(ctx, accountId, "taskUpdates"))
  ) {
    return null;
  }
  return ctx.db.insert("notifications", {
    accountId,
    type: "assignment",
    recipientType,
    recipientId,
    taskId,
    title: `${assignerName} assigned you`,
    body: `You were assigned to task "${taskTitle}"`,
    createdAt: Date.now(),
  });
}

/**
 * Create notification for status change.
 * Respects account notificationPreferences.taskUpdates for user recipients. Returns null when skipped.
 */
export async function createStatusChangeNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  recipientType: RecipientType,
  recipientId: string,
  changerName: string,
  taskTitle: string,
  newStatus: string,
): Promise<Id<"notifications"> | null> {
  if (
    recipientType === "user" &&
    !(await shouldCreateUserNotification(ctx, accountId, "taskUpdates"))
  ) {
    return null;
  }
  return ctx.db.insert("notifications", {
    accountId,
    type: "status_change",
    recipientType,
    recipientId,
    taskId,
    title: `Task status changed to ${newStatus}`,
    body: `${changerName} changed "${taskTitle}" to ${newStatus}`,
    createdAt: Date.now(),
  });
}

/**
 * Create notification when a user is added to the workspace.
 * Respects account notificationPreferences.memberUpdates. Returns null when skipped.
 */
export async function createMemberAddedNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  recipientId: string,
  accountName: string,
  inviterName: string,
): Promise<Id<"notifications"> | null> {
  if (!(await shouldCreateUserNotification(ctx, accountId, "memberUpdates"))) {
    return null;
  }
  return ctx.db.insert("notifications", {
    accountId,
    type: "member_added",
    recipientType: "user",
    recipientId,
    title: `Added to ${accountName}`,
    body: `${inviterName} added you to the workspace`,
    createdAt: Date.now(),
  });
}

/**
 * Create notification when a user is removed from the workspace.
 * Respects account notificationPreferences.memberUpdates. Returns null when skipped.
 */
export async function createMemberRemovedNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  recipientId: string,
  accountName: string,
): Promise<Id<"notifications"> | null> {
  if (!(await shouldCreateUserNotification(ctx, accountId, "memberUpdates"))) {
    return null;
  }
  return ctx.db.insert("notifications", {
    accountId,
    type: "member_removed",
    recipientType: "user",
    recipientId,
    title: `Removed from ${accountName}`,
    body: `You were removed from the workspace`,
    createdAt: Date.now(),
  });
}

/**
 * Create notification when a member's role changes.
 * Respects account notificationPreferences.memberUpdates. Returns null when skipped.
 */
export async function createRoleChangeNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  recipientId: string,
  newRole: string,
  accountName: string,
): Promise<Id<"notifications"> | null> {
  if (!(await shouldCreateUserNotification(ctx, accountId, "memberUpdates"))) {
    return null;
  }
  return ctx.db.insert("notifications", {
    accountId,
    type: "role_changed",
    recipientType: "user",
    recipientId,
    title: `Role updated in ${accountName}`,
    body: `Your role was changed to ${newRole}`,
    createdAt: Date.now(),
  });
}

/**
 * Create runtime status broadcast notifications for all unique account members.
 * Used for critical account-wide runtime transitions (offline/online).
 */
async function createRuntimeStatusBroadcastNotifications(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  title: string,
  body: string,
): Promise<Id<"notifications">[]> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  const recipientIds = new Set<string>();
  for (const membership of memberships) {
    if (membership.userId?.trim()) {
      recipientIds.add(membership.userId);
    }
  }

  const notificationIds: Id<"notifications">[] = [];
  const now = Date.now();
  for (const recipientId of Array.from(recipientIds)) {
    const notificationId = await ctx.db.insert("notifications", {
      accountId,
      type: "status_change",
      recipientType: "user",
      recipientId,
      title,
      body,
      createdAt: now,
    });
    notificationIds.push(notificationId);
  }

  return notificationIds;
}

/**
 * Create mandatory user notifications when account runtime goes offline.
 * This alert is intentionally not preference-gated because runtime outages
 * impact account-wide agent automation.
 */
export async function createRuntimeOfflineNotifications(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  accountName: string,
): Promise<Id<"notifications">[]> {
  return createRuntimeStatusBroadcastNotifications(
    ctx,
    accountId,
    "Runtime is offline",
    `Mission Control runtime for "${accountName}" went offline.`,
  );
}

/**
 * Create mandatory user notifications when account runtime comes back online.
 * This alert is intentionally not preference-gated to surface recovery.
 */
export async function createRuntimeOnlineNotifications(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  accountName: string,
): Promise<Id<"notifications">[]> {
  return createRuntimeStatusBroadcastNotifications(
    ctx,
    accountId,
    "Runtime is online",
    `Mission Control runtime for "${accountName}" is back online.`,
  );
}
