/**
 * Shared orchestrator semantics for task creation (HTTP /agent/task-create and tool).
 * Keeps status and assignee handling in sync so tool and HTTP stay equivalent.
 */

import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { TASK_STATUS, type TaskStatus } from "@packages/shared";

const ALL_TASK_STATUSES = [
  TASK_STATUS.INBOX,
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
  TASK_STATUS.DONE,
  TASK_STATUS.BLOCKED,
  TASK_STATUS.ARCHIVED,
] as const satisfies readonly TaskStatus[];

const TASK_STATUS_SET = new Set<TaskStatus>(ALL_TASK_STATUSES);

function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUS_SET.has(value as TaskStatus);
}

/**
 * Normalize create status for orchestrator: avoid auto-assigning the orchestrator
 * by using inbox when they request assigned/in_progress (service would otherwise
 * auto-assign the creator).
 */
export function normalizeTaskCreateStatusForOrchestrator(
  status: unknown,
  isOrchestrator: boolean,
): TaskStatus | undefined {
  if (typeof status !== "string") return undefined;
  if (!isTaskStatus(status)) return undefined;
  if (
    isOrchestrator &&
    (status === TASK_STATUS.ASSIGNED || status === TASK_STATUS.IN_PROGRESS)
  ) {
    return TASK_STATUS.INBOX;
  }
  return status;
}

/**
 * Remove the orchestrator from the assignee list so they are not self-assigned
 * when delegating task creation.
 */
export function filterOrchestratorFromAssignees(params: {
  assigneeIds: Id<"agents">[];
  requesterAgentId: Id<"agents">;
  isOrchestrator: boolean;
}): Id<"agents">[] {
  if (!params.isOrchestrator) return params.assigneeIds;
  return params.assigneeIds.filter(
    (assigneeId) => assigneeId !== params.requesterAgentId,
  );
}
