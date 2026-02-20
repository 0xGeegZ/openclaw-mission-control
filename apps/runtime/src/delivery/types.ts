/**
 * Delivery context shape from getNotificationForDelivery (Convex service).
 * Kept in a separate module so policy and prompt can depend on it without circular imports.
 * IDs match Convex schema so the runtime stays type-safe end-to-end.
 */

import type { Id } from "@packages/backend/convex/_generated/dataModel";
import type { RecipientType } from "@packages/shared";

/**
 * Full context for a single notification delivery: notification, task, thread, agent, docs, and behavior flags.
 * Populated by Convex service action getNotificationForDelivery; runtime uses it for policy and prompt building.
 */
export interface DeliveryContext {
  notification: {
    _id: Id<"notifications">;
    type: string;
    title: string;
    body: string;
    /** Clerk user ID or agent document ID depending on recipientType. */
    recipientId?: string;
    recipientType?: RecipientType;
    taskId?: Id<"tasks">;
    messageId?: Id<"messages">;
    accountId: Id<"accounts">;
  };
  agent: {
    _id: Id<"agents">;
    slug?: string;
    role?: string;
    name?: string;
  } | null;
  task: {
    _id: Id<"tasks">;
    status: string;
    title: string;
    description?: string;
    assignedAgentIds?: Id<"agents">[];
    labels?: string[];
  } | null;
  message: {
    _id: Id<"messages">;
    authorType: string;
    authorId: string;
    content?: string;
  } | null;
  thread: Array<{
    messageId: Id<"messages">;
    authorType: string;
    authorId: string;
    authorName: string | null;
    content: string;
    createdAt: number;
  }>;
  sourceNotificationType: string | null;
  orchestratorAgentId: Id<"agents"> | null;
  /** Clerk user id and display info (not a Convex document id). */
  primaryUserMention: { id: string; name: string; email: string | null } | null;
  mentionableAgents: Array<{
    id: Id<"agents">;
    slug: string;
    name: string;
    role: string;
  }>;
  assignedAgents: Array<{
    id: Id<"agents">;
    slug: string;
    name: string;
    role: string;
  }>;
  effectiveBehaviorFlags?: {
    canCreateTasks?: boolean;
    canModifyTaskStatus?: boolean;
    canCreateDocuments?: boolean;
    canMentionAgents?: boolean;
    canReviewTasks?: boolean;
    canMarkDone?: boolean;
  };
  /** Resolved runtime session key (task or system). Required for agent notifications; used for send and prompt. */
  deliverySessionKey?: string;
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
        assignedAgentIds: Id<"agents">[];
        assignedUserIds: string[];
      }>;
    }>;
  } | null;
}
