/**
 * Task status tool for OpenResponses client-side tools.
 * Schema and execution for task_status; used when agent has canModifyTaskStatus and a task context exists.
 */

import { getConvexClient, api } from "../convex-client";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

const ALLOWED_STATUSES = new Set(["in_progress", "review", "done", "blocked"]);

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

  if (!ALLOWED_STATUSES.has(status)) {
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
      status: status as "in_progress" | "review" | "done" | "blocked",
      blockedReason: blockedReason?.trim() || undefined,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
