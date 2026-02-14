/**
 * Delivery policy: who receives which notifications and how no-response is handled.
 *
 * Policy matrix (implementation target):
 * - thread_update / passive status_change: no synthetic orchestrator ack; no fallback post for routine no-response; mark delivered on terminal no-response.
 * - assignment, mention, response_request: keep retry budget; on exhausted retries produce one deterministic fallback outcome, then mark delivered.
 *
 * Invariant: every processed notification reaches a terminal state (delivered, skipped, or one fallback then delivered). No perpetual requeue.
 */

import type { DeliveryContext } from "./types";

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
 * Whether the agent role is a reviewer (e.g. Squad Lead, QA).
 * @param role - Agent role string.
 * @returns true if role matches squad lead, qa, or review (case-insensitive).
 */
export function isReviewerRole(role: string | undefined): boolean {
  if (!role) return false;
  return /squad lead|qa|review/i.test(role);
}

/**
 * Whether an agent profile is QA (by slug or role).
 * @param profile - Agent profile with optional role and slug.
 * @returns true if slug is "qa" or role contains QA-related terms.
 */
export function isQaAgentProfile(
  profile?: {
    role?: string;
    slug?: string;
  } | null,
): boolean {
  if (!profile) return false;
  const role = profile.role ?? "";
  const slug = profile.slug ?? "";
  if (slug.trim().toLowerCase() === "qa") return true;
  return /\bqa\b|quality assurance|quality\b/i.test(role);
}

/**
 * Whether the agent can mark a task as done. Requires task in review; when QA exists, only QA can close.
 * @param options - Task status, agent role/slug, orchestrator flag, and whether account has a QA agent.
 * @returns true if task is in review and (no QA => orchestrator can close, has QA => this agent is QA).
 */
export function canAgentMarkDone(options: {
  taskStatus?: string;
  agentRole?: string;
  agentSlug?: string;
  isOrchestrator: boolean;
  hasQaAgent: boolean;
}): boolean {
  if (options.taskStatus !== "review") return false;
  if (options.hasQaAgent) {
    return isQaAgentProfile({
      role: options.agentRole,
      slug: options.agentSlug,
    });
  }
  return options.isOrchestrator;
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
      return isReviewerRole(context.agent?.role);
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
        ? assignedAgentIds.includes(recipientId)
        : false;
    const isReviewerRecipient =
      taskStatus === "review" && isReviewerRole(agentRole);
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
