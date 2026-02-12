/**
 * Task workflow logic for status transitions and requirements.
 * Uses shared types and constants from validators.ts and constants.ts.
 */
import type { TaskStatus } from "./validators";

import {
  TASK_STATUS,
  TASK_STATUS_TRANSITIONS,
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
  PAUSE_ALLOWED_STATUSES,
} from "./constants";

// Re-export type for convenience
export type { TaskStatus };

// Re-export constants for backward compatibility
export {
  TASK_STATUS,
  TASK_STATUS_TRANSITIONS,
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
  PAUSE_ALLOWED_STATUSES,
};

/** Set for O(1) lookup with proper typing - accepts any TaskStatus in .has() */
export const PAUSE_ALLOWED_STATUS_SET = new Set<TaskStatus>(PAUSE_ALLOWED_STATUSES);

/** Map of Sets for O(1) transition validation with proper typing */
const TRANSITION_SETS = new Map<TaskStatus, Set<TaskStatus>>(
  (Object.entries(TASK_STATUS_TRANSITIONS) as [TaskStatus, readonly TaskStatus[]][]).map(
    ([status, targets]) => [status, new Set(targets)],
  ),
);

/**
 * Check if a status transition is valid.
 *
 * @param currentStatus - Current task status
 * @param nextStatus - Proposed next status
 * @returns True if transition is allowed
 */
export function isValidTransition(
  currentStatus: TaskStatus,
  nextStatus: TaskStatus,
): boolean {
  return TRANSITION_SETS.get(currentStatus)?.has(nextStatus) ?? false;
}

/**
 * Validate status transition requirements.
 * Returns error message if invalid, null if valid.
 *
 * @param nextStatus - Proposed next status
 * @param hasAssignees - Whether task has assignees
 * @param blockedReason - Blocked reason (if transitioning to blocked)
 * @returns Error message or null
 */
export function validateStatusRequirements(
  nextStatus: TaskStatus,
  hasAssignees: boolean,
  blockedReason?: string,
): string | null {
  // "assigned" requires at least one assignee
  if (nextStatus === TASK_STATUS.ASSIGNED && !hasAssignees) {
    return "Cannot move to 'assigned' without at least one assignee";
  }

  // "inbox" requires zero assignees
  if (nextStatus === TASK_STATUS.INBOX && hasAssignees) {
    return "Cannot move to 'inbox' while assignees remain";
  }

  // "in_progress" requires at least one assignee
  if (nextStatus === TASK_STATUS.IN_PROGRESS && !hasAssignees) {
    return "Cannot move to 'in_progress' without at least one assignee";
  }

  // "blocked" requires a reason
  if (nextStatus === TASK_STATUS.BLOCKED && !blockedReason) {
    return "Cannot move to 'blocked' without providing a reason";
  }

  return null;
}

/**
 * Returns true if a task in this status can be paused via /stop (moved to blocked).
 *
 * @param status - Current task status
 * @returns True if pauseAgentsOnTask will transition to blocked; false for inbox, done, or already blocked
 */
export function isPauseAllowedStatus(status: TaskStatus): boolean {
  return PAUSE_ALLOWED_STATUS_SET.has(status);
}
