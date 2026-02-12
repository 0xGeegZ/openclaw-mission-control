/**
 * Task status tool for OpenResponses client-side tools.
 * Schema and execution for task_status; used when agent has canModifyTaskStatus and a task context exists.
 */

import { getConvexClient, api } from "../convex-client";
import { createLogger } from "../logger";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import type { TaskStatus } from "@packages/shared";

const log = createLogger("[TaskStatusTool]");

type RuntimeTaskStatus = Extract<
  TaskStatus,
  "in_progress" | "review" | "done" | "blocked"
>;

const ALLOWED_STATUSES = new Set<RuntimeTaskStatus>([
  "in_progress",
  "review",
  "done",
  "blocked",
]);

function isRuntimeTaskStatus(value: string): value is RuntimeTaskStatus {
  return ALLOWED_STATUSES.has(value as RuntimeTaskStatus);
}

/**
 * Build the task_status tool schema with optional "done" support.
 * The enum is tailored per agent to avoid invalid "done" requests.
 */
export function createTaskStatusToolSchema(options?: {
  allowDone?: boolean;
}): typeof TASK_STATUS_TOOL_SCHEMA {
  const allowDone = options?.allowDone !== false;
  const statusEnum = allowDone
    ? ["in_progress", "review", "done", "blocked"]
    : ["in_progress", "review", "blocked"];
  return {
    type: "function" as const,
    function: {
      name: "task_status",
      description:
        "Update the current task's status. Call this BEFORE posting your thread reply when you change status (e.g. move to done, review, or blocked). Posting alone does not update the task.",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "The task ID (from the notification prompt)",
          },
          status: {
            type: "string",
            enum: statusEnum,
            description: "New status for the task",
          },
          blockedReason: {
            type: "string",
            description:
              "Required when status is 'blocked'; reason for blocking",
          },
        },
        required: ["taskId", "status"],
      },
    },
  };
}

/** OpenResponses function tool schema for task_status */
export const TASK_STATUS_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_status",
    description:
      "Update the current task's status. Call this BEFORE posting your thread reply when you change status (e.g. move to done, review, or blocked). Posting alone does not update the task.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The task ID (from the notification prompt)",
        },
        status: {
          type: "string",
          enum: ["in_progress", "review", "done", "blocked"],
          description: "New status for the task",
        },
        blockedReason: {
          type: "string",
          description: "Required when status is 'blocked'; reason for blocking",
        },
      },
      required: ["taskId", "status"],
    },
  },
};

export interface TaskStatusToolResult {
  success: boolean;
  error?: string;
}

/**
 * Execute task_status tool call via Convex service action.
 * Validates status and blockedReason; returns result for function_call_output.
 */
export async function executeTaskStatusTool(params: {
  agentId: Id<"agents">;
  taskId: string;
  status: string;
  blockedReason?: string;
  serviceToken: string;
  accountId: Id<"accounts">;
}): Promise<TaskStatusToolResult> {
  const { agentId, taskId, status, blockedReason, serviceToken, accountId } =
    params;

  if (!taskId.trim()) {
    return { success: false, error: "taskId is required" };
  }
  if (!isRuntimeTaskStatus(status)) {
    return {
      success: false,
      error: `Invalid status: must be one of in_progress, review, done, blocked`,
    };
  }
  if (status === "blocked" && !blockedReason?.trim()) {
    return {
      success: false,
      error: "blockedReason is required when status is blocked",
    };
  }

  try {
    const client = getConvexClient();
    await client.action(api.service.actions.updateTaskStatusFromAgent, {
      accountId,
      serviceToken,
      agentId,
      taskId: taskId as Id<"tasks">,
      status: status as RuntimeTaskStatus,
      blockedReason: blockedReason?.trim() || undefined,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(
      "Task status update failed (task will not move to done); check Convex connectivity",
      { taskId, status, error: message },
    );
    return { success: false, error: message };
  }
}
