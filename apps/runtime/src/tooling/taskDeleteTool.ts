/**
 * Task delete tool for orchestrator-only operations.
 * Schema and execution for task_delete; archives/removes tasks from backlog.
 * Input: { taskId, reason }
 * Use: clean up stale tasks, remove mistaken creates, archive done tasks.
 * Orchestrator-only; soft-delete with audit trail (messages/documents preserved).
 */

import { getConvexClient, api } from "../convex-client";
import { createLogger } from "../logger";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

const log = createLogger("[TaskDeleteTool]");

/**
 * OpenResponses function tool schema for task_delete.
 * Orchestrator-only tool for archiving/removing tasks.
 */
export const TASK_DELETE_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_delete",
    description:
      "Archive or remove a task from the backlog (soft delete). Orchestrator-only. Preserves messages and documents for audit trail. Provide a reason for archival.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The task ID to archive",
        },
        reason: {
          type: "string",
          description:
            "Reason for archival (e.g., 'out of scope', 'duplicate', 'mistaken create')",
        },
      },
      required: ["taskId", "reason"],
    },
  },
};

export interface TaskDeleteToolResult {
  success: boolean;
  error?: string;
}

/**
 * Execute task_delete tool call via Convex service action.
 * Validates taskId and reason; archives task to "archived" status with timestamp.
 * Returns result for function_call_output.
 */
export async function executeTaskDeleteTool(params: {
  agentId: Id<"agents">;
  taskId: string;
  reason: string;
  serviceToken: string;
  accountId: Id<"accounts">;
}): Promise<TaskDeleteToolResult> {
  const { agentId, taskId, reason, serviceToken, accountId } = params;

  if (!taskId.trim()) {
    return { success: false, error: "taskId is required" };
  }
  if (!reason?.trim()) {
    return { success: false, error: "reason is required for archival" };
  }

  try {
    const client = getConvexClient();
    await client.action(api.service.actions.deleteTaskFromAgent, {
      accountId,
      serviceToken,
      agentId,
      taskId: taskId as Id<"tasks">,
      reason: reason.trim(),
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(
      "Task deletion failed (task will not be archived); check Convex connectivity or permissions",
      { taskId, reason, error: message },
    );
    return { success: false, error: message };
  }
}
