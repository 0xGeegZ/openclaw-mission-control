/**
 * Delivery context shape from getNotificationForDelivery (Convex service).
 * Kept in a separate module so policy and prompt can depend on it without circular imports.
 */

import type { RecipientType } from "@packages/shared";

export interface DeliveryContext {
  notification: {
    _id: string;
    type: string;
    title: string;
    body: string;
    recipientId?: string;
    recipientType?: RecipientType;
    taskId?: string;
    messageId?: string;
    accountId: string;
  };
  agent: {
    _id: string;
    sessionKey?: string;
    role?: string;
    name?: string;
  } | null;
  task: {
    _id: string;
    status: string;
    title: string;
    description?: string;
    assignedAgentIds?: string[];
    labels?: string[];
  } | null;
  message: {
    _id: string;
    authorType: string;
    authorId: string;
    content?: string;
  } | null;
  thread: Array<{
    messageId: string;
    authorType: string;
    authorId: string;
    authorName: string | null;
    content: string;
    createdAt: number;
  }>;
  sourceNotificationType: string | null;
  orchestratorAgentId: string | null;
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
  effectiveBehaviorFlags?: {
    canCreateTasks?: boolean;
    canModifyTaskStatus?: boolean;
    canCreateDocuments?: boolean;
    canMentionAgents?: boolean;
    canReviewTasks?: boolean;
    canMarkDone?: boolean;
  };
  repositoryDoc: { title: string; content: string } | null;
  globalBriefingDoc: { title: string; content: string } | null;
  taskOverview: {
    totals: Array<{ status: string; count: number }>;
    topTasks: Array<{
      status: string;
      tasks: Array<{
        taskId: string;
        title: string;
        status: string;
        priority: number;
        assignedAgentIds: string[];
        assignedUserIds: string[];
      }>;
    }>;
  } | null;
}
