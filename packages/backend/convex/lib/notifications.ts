import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ParsedMention } from "./mentions";

/** Notification preference category. When false, user notifications in that category are skipped (unless forceCreate). */
export type NotificationPreferenceCategory = "taskUpdates" | "agentActivity" | "memberUpdates";

/**
 * Check whether to create a user notification based on account preferences.
 * When forceCreate is true (e.g. mandatory system alerts), skip preference check.
 */
export async function shouldCreateUserNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  category: NotificationPreferenceCategory,
  options?: { forceCreate?: boolean }
): Promise<boolean> {
  if (options?.forceCreate) return true;
  const account = await ctx.db.get(accountId);
  if (!account) return false;
  const prefs = (account as { settings?: { notificationPreferences?: Record<string, boolean> } }).settings?.notificationPreferences;
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
  taskTitle: string
): Promise<Id<"notifications">[]> {
  const notificationIds: Id<"notifications">[] = [];
  for (const mention of mentions) {
    if (mention.type === "user" && !(await shouldCreateUserNotification(ctx, accountId, "agentActivity"))) {
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

/**
 * Create notifications for thread subscribers.
 * Called after a message is created, excluding author and already-mentioned.
 * Respects account notificationPreferences.agentActivity for user recipients.
 */
export async function createThreadNotifications(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  messageId: Id<"messages">,
  authorType: "user" | "agent",
  authorId: string,
  authorName: string,
  taskTitle: string,
  mentionedIds: Set<string>
): Promise<Id<"notifications">[]> {
  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  const notificationIds: Id<"notifications">[] = [];
  for (const subscription of subscriptions) {
    if (subscription.subscriberType === authorType && subscription.subscriberId === authorId) continue;
    if (mentionedIds.has(subscription.subscriberId)) continue;
    if (subscription.subscriberType === "user" && !(await shouldCreateUserNotification(ctx, accountId, "agentActivity"))) {
      continue;
    }
    const notificationId = await ctx.db.insert("notifications", {
      accountId,
      type: "thread_update",
      recipientType: subscription.subscriberType,
      recipientId: subscription.subscriberId,
      taskId,
      messageId,
      title: `${authorName} replied`,
      body: `New message in task "${taskTitle}"`,
      createdAt: Date.now(),
    });
    notificationIds.push(notificationId);
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
  recipientType: "user" | "agent",
  recipientId: string,
  assignerName: string,
  taskTitle: string
): Promise<Id<"notifications"> | null> {
  if (recipientType === "user" && !(await shouldCreateUserNotification(ctx, accountId, "taskUpdates"))) {
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
  recipientType: "user" | "agent",
  recipientId: string,
  changerName: string,
  taskTitle: string,
  newStatus: string
): Promise<Id<"notifications"> | null> {
  if (recipientType === "user" && !(await shouldCreateUserNotification(ctx, accountId, "taskUpdates"))) {
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
  inviterName: string
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
  accountName: string
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
  accountName: string
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
