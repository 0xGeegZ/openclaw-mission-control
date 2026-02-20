/**
 * Delivery policy: who receives which notifications and how no-response is handled.
 *
 * Policy matrix (implementation target):
 * - thread_update / passive status_change: no synthetic orchestrator ack; no fallback post for routine no-response; mark delivered on terminal no-response.
 * - assignment, mention, response_request: keep retry budget; on exhausted retries produce one deterministic fallback outcome, then mark delivered.
 *
 * Invariant: every processed notification reaches a terminal state (delivered, skipped, or one fallback then delivered). No perpetual requeue.
 */

import type { Id } from "@packages/backend/convex/_generated/dataModel";
import type { DeliveryContext } from "@packages/backend/convex/service/notifications";

/** Task statuses for which we skip delivering status_change to agents (avoid ack storms). */
export const TASK_STATUSES_SKIP_STATUS_CHANGE = new Set<string>([
  "done",
  "blocked",
]);

/** Notification types that require a reply; others are passive (retry not required). */
export const REQUIRED_REPLY_NOTIFICATION_TYPES = new Set([
  "assignment",
  "mention",
  "response_request",
]);

const ORCHESTRATOR_CHAT_LABEL = "system:orchestrator-chat";

/**
 * Whether the task is the orchestrator chat thread (only orchestrator receives agent notifications for that task).
 * @param task - Task from delivery context (may be null).
 * @returns true if task has label `system:orchestrator-chat`.
 */
export function isOrchestratorChatTask(
  task: DeliveryContext["task"] | null | undefined,
): boolean {
  return !!task?.labels?.includes(ORCHESTRATOR_CHAT_LABEL);
}

/**
 * Whether the agent can receive review-related notifications (status_change to review, thread_update when in review).
 * Based on explicit behavior flag only; no role/slug heuristics.
 */
export function agentCanReview(context: DeliveryContext): boolean {
  return context.effectiveBehaviorFlags?.canReviewTasks === true;
}

/**
 * Whether the agent can mark a task as done. Requires task in review and explicit canMarkDone flag.
 * No role/slug heuristics (e.g. QA); gating is via behavior flags only.
 */
export function canAgentMarkDone(options: {
  taskStatus?: string;
  canMarkDone?: boolean;
}): boolean {
  return options.taskStatus === "review" && options.canMarkDone === true;
}

/**
 * Whether the recipient agent is one of multiple assignees on the task (used to show collaboration instructions in the prompt).
 * @param context - Full delivery context.
 * @returns true when task has 2+ assignees and context.agent._id is in that list.
 */
export function isRecipientInMultiAssigneeTask(
  context: DeliveryContext,
): boolean {
  const ids = context.task?.assignedAgentIds;
  const agentId = context.agent?._id;
  if (!ids || ids.length < 2 || !agentId) return false;
  return ids.includes(agentId);
}

/**
 * Whether we should deliver this notification to the agent.
 * Orchestrator remains informed; loop prevention and task-state rules apply.
 * @param context - Full delivery context from getNotificationForDelivery.
 * @returns true if the notification should be sent to the agent, false to skip (and mark delivered).
 */
export function shouldDeliverToAgent(context: DeliveryContext): boolean {
  const notificationType = context.notification?.type;
  const messageAuthorType = context.message?.authorType;
  const taskStatus = context.task?.status;
  const isOrchestratorChat = isOrchestratorChatTask(context.task);
  const orchestratorAgentId = context.orchestratorAgentId;
  const messageAuthorId = context.message?.authorId;
  const isBlockedTask = taskStatus === "blocked";

  if (isOrchestratorChat && context.notification?.recipientType === "agent") {
    return context.notification?.recipientId === context.orchestratorAgentId;
  }

  if (
    notificationType === "thread_update" &&
    taskStatus != null &&
    TASK_STATUSES_SKIP_STATUS_CHANGE.has(taskStatus)
  ) {
    return false;
  }

  if (
    notificationType === "status_change" &&
    context.notification?.recipientType === "agent" &&
    taskStatus != null
  ) {
    if (TASK_STATUSES_SKIP_STATUS_CHANGE.has(taskStatus)) return false;
    if (taskStatus === "review") {
      const recipientId = context.notification?.recipientId;
      if (orchestratorAgentId != null && recipientId === orchestratorAgentId) {
        return true;
      }
      return agentCanReview(context);
    }
  }

  if (notificationType === "thread_update" && messageAuthorType === "agent") {
    const recipientId = context.notification?.recipientId;
    const assignedAgentIds = context.task?.assignedAgentIds;
    const sourceNotificationType = context.sourceNotificationType;
    const agentRole = context.agent?.role;
    const isOrchestratorRecipient =
      orchestratorAgentId != null && recipientId === orchestratorAgentId;
    const isOrchestratorAuthor =
      orchestratorAgentId != null && messageAuthorId === orchestratorAgentId;

    if (
      taskStatus != null &&
      TASK_STATUSES_SKIP_STATUS_CHANGE.has(taskStatus) &&
      !(isBlockedTask && isOrchestratorAuthor)
    ) {
      return false;
    }
    if (isOrchestratorRecipient && !isOrchestratorAuthor) {
      return true;
    }
    const isAssignedRecipient =
      Array.isArray(assignedAgentIds) && typeof recipientId === "string"
        ? assignedAgentIds.includes(recipientId as Id<"agents">)
        : false;
    const isReviewerRecipient =
      taskStatus === "review" && agentCanReview(context);
    if (sourceNotificationType === "thread_update") {
      if (
        isOrchestratorAuthor &&
        (isAssignedRecipient || isReviewerRecipient)
      ) {
        return true;
      }
      return false;
    }
    if (isReviewerRecipient) return true;
    return isAssignedRecipient;
  }

  return true;
}

/**
 * Whether no-response for this notification should trigger retries (required-reply types only).
 * Passive updates (e.g. thread_update from agent) do not retry.
 * @param context - Delivery context (notification type and message author).
 * @returns true for assignment, mention, response_request; for thread_update, true only when message author is not agent.
 */
export function shouldRetryNoResponseForNotification(
  context: DeliveryContext,
): boolean {
  const notificationType = context.notification?.type;
  if (!notificationType) return false;
  if (REQUIRED_REPLY_NOTIFICATION_TYPES.has(notificationType)) return true;
  if (notificationType === "thread_update") {
    return context.message?.authorType !== "agent";
  }
  return false;
}

/**
 * Orchestrator is silent-by-default: we do not post synthetic acknowledgments for routine agent updates.
 * This function is kept for tests and future optional re-enable; currently always false.
 */
export function shouldPersistOrchestratorThreadAck(
  _context: DeliveryContext,
): boolean {
  return false;
}

/** @internal Exposed for unit tests. */
export const _shouldPersistOrchestratorThreadAck =
  shouldPersistOrchestratorThreadAck;

/**
 * Whether to persist a fallback message to the task thread when OpenClaw returns no response.
 * Kept for tests and future optional re-enable; currently always false so users do not see
 * "OpenClaw did not return a response for this run" boilerplate in the thread. Terminal
 * outcome is still deterministic (mark delivered); observability via logs and
 * requiredNotificationRetryExhaustedCount / noResponseTerminalSkipCount.
 */
export function shouldPersistNoResponseFallback(_options: {
  notificationType: string;
}): boolean {
  return false;
}
