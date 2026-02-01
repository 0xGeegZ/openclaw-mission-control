/**
 * Task status type.
 */
export type TaskStatus = 
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

/**
 * Valid status transitions.
 * Maps current status to array of allowed next statuses.
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  inbox: ["assigned"],
  assigned: ["in_progress", "blocked"],
  in_progress: ["review", "blocked"],
  review: ["done", "in_progress"],
  done: [], // Cannot transition from done
  blocked: ["assigned", "in_progress"],
};

/**
 * Ordered list of statuses for Kanban columns.
 */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "done",
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
  nextStatus: TaskStatus
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
  blockedReason?: string
): string | null {
  // "assigned" requires at least one assignee
  if (nextStatus === "assigned" && !hasAssignees) {
    return "Cannot move to 'assigned' without at least one assignee";
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
 * Get human-readable label for status.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};
