/**
 * Task update tool for OpenResponses client-side tools.
 * Unified schema and execution for task_update; enables flexible field updates.
 * Supports: title, description, priority, labels, assignees, status, blockedReason, dueDate.
 */

import { getConvexClient, api } from "../convex-client";
import { createLogger } from "../logger";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { TASK_STATUS, type TaskStatus } from "@packages/shared";

const log = createLogger("[TaskUpdateTool]");

const TASK_UPDATE_ALLOWED_STATUSES = [
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
  TASK_STATUS.DONE,
  TASK_STATUS.BLOCKED,
] as const satisfies readonly TaskStatus[];

type TaskUpdateStatus = (typeof TASK_UPDATE_ALLOWED_STATUSES)[number];

const ALLOWED_STATUSES = new Set<TaskUpdateStatus>(TASK_UPDATE_ALLOWED_STATUSES);

function isTaskUpdateStatus(value: string): value is TaskUpdateStatus {
  return ALLOWED_STATUSES.has(value as TaskUpdateStatus);
}

/**
 * OpenResponses function tool schema for task_update.
 * All parameters are optional; at least one must be provided.
 */
export const TASK_UPDATE_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_update",
    description:
      "Update any combination of task fields: title, description, priority, labels, assignees, status, dueDate. Call this BEFORE posting your thread reply when you modify the task. All parameters are optional, but at least one must be provided.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The task ID (required)",
        },
        title: {
          type: "string",
          description: "New title for the task",
        },
        description: {
          type: "string",
          description: "New description for the task",
        },
        priority: {
          type: "number",
          description: "Priority level (1=highest/critical, 5=lowest)",
          minimum: 1,
          maximum: 5,
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Array of label strings (replaces all existing labels)",
        },
        assignedAgentIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of agent IDs to assign to this task",
        },
        assignedUserIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of user IDs to assign to this task",
        },
        status: {
          type: "string",
          enum: [...TASK_UPDATE_ALLOWED_STATUSES],
          description: "New status for the task",
        },
        blockedReason: {
          type: "string",
          description:
            "Reason for blocking the task (required when status is 'blocked')",
        },
        dueDate: {
          type: "number",
          description: "Due date as Unix timestamp (ms)",
        },
      },
      required: ["taskId"],
    },
  },
};

export interface TaskUpdateToolResult {
  success: boolean;
  taskId?: string;
  error?: string;
  message?: string;
}

/**
 * Execute task_update tool call via Convex service action.
 * Validates all fields and permissions before updating.
 */
export async function executeTaskUpdateTool(params: {
  agentId: Id<"agents">;
  taskId: string;
  title?: string;
  description?: string;
  priority?: number;
  labels?: string[];
  assignedAgentIds?: string[];
  assignedUserIds?: string[];
  status?: string;
  blockedReason?: string;
  dueDate?: number;
  serviceToken: string;
  accountId: Id<"accounts">;
}): Promise<TaskUpdateToolResult> {
  const {
    agentId,
    taskId,
    title,
    description,
    priority,
    labels,
    assignedAgentIds,
    assignedUserIds,
    status,
    blockedReason,
    dueDate,
    serviceToken,
    accountId,
  } = params;

  // Validate taskId (guard against undefined/null and whitespace-only)
  if (taskId == null || !String(taskId).trim()) {
    return { success: false, error: "taskId is required" };
  }
  const trimmedTaskId = String(taskId).trim();

  // Validate at least one field is provided
  const hasUpdates =
    title !== undefined ||
    description !== undefined ||
    priority !== undefined ||
    labels !== undefined ||
    assignedAgentIds !== undefined ||
    assignedUserIds !== undefined ||
    status !== undefined ||
    dueDate !== undefined;

  if (!hasUpdates) {
    return {
      success: false,
      error: "At least one field (title, description, priority, labels, assignedAgentIds, assignedUserIds, status, dueDate) must be provided",
    };
  }

  // Validate status if provided
  if (status && !isTaskUpdateStatus(status)) {
    return {
      success: false,
      error: `Invalid status: must be one of in_progress, review, done, blocked`,
    };
  }
  const validatedStatus: TaskUpdateStatus | undefined =
    status && isTaskUpdateStatus(status) ? status : undefined;

  // Validate blockedReason requirement
  if (status === "blocked" && !blockedReason?.trim()) {
    return {
      success: false,
      error: "blockedReason is required when status is 'blocked'",
    };
  }

  // Validate priority range (schema: 1 = highest, 5 = lowest)
  if (priority !== undefined && (priority < 1 || priority > 5)) {
    return {
      success: false,
      error: "priority must be between 1 (highest) and 5 (lowest)",
    };
  }

  try {
    const client = getConvexClient();
    const result = await client.action(api.service.actions.updateTaskFromAgent, {
      accountId,
      serviceToken,
      agentId,
      taskId: trimmedTaskId as Id<"tasks">,
      title: title?.trim(),
      description: description?.trim(),
      priority,
      labels,
      assignedAgentIds: assignedAgentIds ? (assignedAgentIds as Id<"agents">[]) : undefined,
      assignedUserIds,
      status: validatedStatus,
      blockedReason: blockedReason?.trim(),
      dueDate,
    });

    return {
      success: true,
      taskId: result.taskId,
      message: `Task updated successfully. ${result.changedFields.length > 0 ? `Modified: ${result.changedFields.join(", ")}` : "No changes made."}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Task update failed; check Convex connectivity", {
      taskId: trimmedTaskId,
      error: message,
    });
    return { success: false, error: message };
  }
}
