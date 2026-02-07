/**
 * Task status type.
 */
export type TaskStatus =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "blocked"
  | "archived";

/**
 * Valid status transitions.
 * Maps current status to array of allowed next statuses.
 * "archived" is a terminal state (soft-delete) reachable from most statuses via orchestrator action.
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  inbox: ["assigned", "archived"],
  assigned: ["in_progress", "blocked", "inbox", "archived"],
  in_progress: ["review", "blocked", "archived"],
  review: ["done", "in_progress", "blocked", "archived"],
  done: ["archived"], // Can archive completed tasks
  blocked: ["assigned", "in_progress", "archived"],
  archived: [], // Terminal state; cannot transition from archived
};

/**
 * Ordered list of statuses for Kanban columns.
 * Archived tasks are typically hidden from the main board but accessible in history/archive views.
 */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "done",
  "archived",
];

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
  const allowed = TASK_STATUS_TRANSITIONS[currentStatus];
  return allowed.includes(nextStatus);
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
  if (nextStatus === "assigned" && !hasAssignees) {
    return "Cannot move to 'assigned' without at least one assignee";
  }

  // "inbox" requires zero assignees
  if (nextStatus === "inbox" && hasAssignees) {
    return "Cannot move to 'inbox' while assignees remain";
  }

  // "in_progress" requires at least one assignee
  if (nextStatus === "in_progress" && !hasAssignees) {
    return "Cannot move to 'in_progress' without at least one assignee";
  }

  // "blocked" requires a reason
  if (nextStatus === "blocked" && !blockedReason) {
    return "Cannot move to 'blocked' without providing a reason";
  }

  return null;
}

/**
 * Statuses from which /stop can move the task to blocked (emergency pause).
 * Used by pauseAgentsOnTask; exported for unit tests.
 */
export const PAUSE_ALLOWED_STATUSES: readonly TaskStatus[] = [
  "assigned",
  "in_progress",
  "review",
];

/**
 * Returns true if a task in this status can be paused via /stop (moved to blocked).
 *
 * @param status - Current task status
 * @returns True if pauseAgentsOnTask will transition to blocked; false for inbox, done, or already blocked
 */
export function isPauseAllowedStatus(status: TaskStatus): boolean {
  return (PAUSE_ALLOWED_STATUSES as readonly string[]).includes(status);
}

/**
 * Get human-readable label for status.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
  archived: "Archived",
};
