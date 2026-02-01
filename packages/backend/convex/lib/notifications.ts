import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ParsedMention } from "./mentions";

/**
 * Notification type.
 */
export type NotificationType = 
  | "mention"
  | "assignment"
  | "thread_update"
  | "status_change";

/**
 * Create notifications for mentions.
 * Called after a message is created with mentions.
 * Agent messages: when the runtime posts a message (service/messages or messages.create with authorType "agent"),
 * these create mention/thread notifications for recipients (agent_message-style notifications).
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
  // Get all subscribers
  const subscriptions = await ctx.db
    .query("subscriptions")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  
  const notificationIds: Id<"notifications">[] = [];
  
  for (const subscription of subscriptions) {
    // Skip author
    if (subscription.subscriberType === authorType && subscription.subscriberId === authorId) {
      continue;
    }
    
    // Skip already mentioned (they got a mention notification)
    if (mentionedIds.has(subscription.subscriberId)) {
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
 */
export async function createAssignmentNotification(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  recipientType: "user" | "agent",
  recipientId: string,
  assignerName: string,
  taskTitle: string
): Promise<Id<"notifications">> {
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
): Promise<Id<"notifications">> {
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
