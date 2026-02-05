/**
 * OpenResponses client-side tools for agents.
 * Schemas and execution for task_create, task_status, document_upsert.
 * Tools are attached only when the agent's effective behavior flags allow them.
 */

import { getConvexClient, api } from "../convex-client";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import {
  TASK_STATUS_TOOL_SCHEMA,
  executeTaskStatusTool,
  type TaskStatusToolResult,
} from "./taskStatusTool";

/** OpenResponses function tool schema: create a new task */
export const TASK_CREATE_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_create",
    description:
      "Create a new task. Use when you need to spawn a follow-up task or capture work that should be tracked. Call before posting a reply if you create a task.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: {
          type: "string",
          description: "Optional task description (Markdown supported)",
        },
        priority: {
          type: "number",
          description: "Priority 1 (highest) to 5 (lowest); default 3",
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: "Optional labels",
        },
        status: {
          type: "string",
          enum: [
            "inbox",
            "assigned",
            "in_progress",
            "review",
            "done",
            "blocked",
          ],
          description:
            "Initial status; default inbox. If assigned/in_progress, you are auto-assigned. blocked requires blockedReason.",
        },
        blockedReason: {
          type: "string",
          description: "Required when status is blocked",
        },
        dueDate: {
          type: "number",
          description: "Optional due date (Unix timestamp in ms)",
        },
      },
      required: ["title"],
    },
  },
};

/** OpenResponses function tool schema: create or update a document */
export const DOCUMENT_UPSERT_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "document_upsert",
    description:
      "Create or update a document (deliverable, note, template, or reference). Use documentId to update an existing document.",
    parameters: {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "Optional; when provided, updates this document",
        },
        taskId: {
          type: "string",
          description: "Optional; link document to a task",
        },
        title: { type: "string", description: "Document title" },
        content: { type: "string", description: "Document body (Markdown)" },
        type: {
          type: "string",
          enum: ["deliverable", "note", "template", "reference"],
          description: "Document type",
        },
      },
      required: ["title", "content", "type"],
    },
  },
};

export { TASK_STATUS_TOOL_SCHEMA };

export type ToolResult = {
  success: boolean;
  error?: string;
  taskId?: string;
  documentId?: string;
};

/**
 * Build the list of tool schemas to send to OpenClaw based on effective behavior flags and task context.
 * task_status is offered only when a task exists and the agent can modify status.
 *
 * @param options - Capability flags and task context from delivery.
 * @returns Array of OpenResponses tool schemas (task_status, task_create, document_upsert as allowed).
 */
export function getToolSchemasForCapabilities(options: {
  canCreateTasks: boolean;
  canModifyTaskStatus: boolean;
  canCreateDocuments: boolean;
  hasTaskContext: boolean;
}): unknown[] {
  const tools: unknown[] = [];
  if (options.hasTaskContext && options.canModifyTaskStatus) {
    tools.push(TASK_STATUS_TOOL_SCHEMA);
  }
  if (options.canCreateTasks) {
    tools.push(TASK_CREATE_TOOL_SCHEMA);
  }
  if (options.canCreateDocuments) {
    tools.push(DOCUMENT_UPSERT_TOOL_SCHEMA);
  }
  return tools;
}

/**
 * Execute a single tool call by name; returns result for function_call_output.
 *
 * @param params - Tool name, JSON arguments string, agent/account/task context, and service token.
 * @returns Result with success flag; on failure includes error message. taskId/documentId set when relevant.
 */
export async function executeAgentTool(params: {
  name: string;
  arguments: string;
  agentId: Id<"agents">;
  accountId: Id<"accounts">;
  serviceToken: string;
  taskId?: Id<"tasks">;
}): Promise<{
  success: boolean;
  error?: string;
  taskId?: string;
  documentId?: string;
}> {
  const {
    name,
    arguments: argsStr,
    agentId,
    accountId,
    serviceToken,
    taskId,
  } = params;
  const client = getConvexClient();

  if (name === "task_status") {
    let args: { taskId?: string; status?: string; blockedReason?: string } = {};
    try {
      const parsed = JSON.parse(argsStr || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { success: false, error: "Invalid JSON arguments" };
      }
      args = parsed as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    const result: TaskStatusToolResult = await executeTaskStatusTool({
      agentId,
      taskId: args.taskId ?? taskId ?? "",
      status: args.status ?? "",
      blockedReason: args.blockedReason,
      serviceToken,
      accountId,
    });
    return result;
  }

  if (name === "task_create") {
    let args: {
      title?: string;
      description?: string;
      priority?: number;
      labels?: string[];
      status?: string;
      blockedReason?: string;
      dueDate?: number;
    };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    if (!args.title?.trim()) {
      return { success: false, error: "title is required" };
    }
    try {
      const { taskId: newTaskId } = await client.action(
        api.service.actions.createTaskFromAgent,
        {
          accountId,
          serviceToken,
          agentId,
          title: args.title.trim(),
          description: args.description?.trim(),
          priority: args.priority,
          labels: args.labels,
          status: args.status as
            | "inbox"
            | "assigned"
            | "in_progress"
            | "review"
            | "done"
            | "blocked"
            | undefined,
          blockedReason: args.blockedReason?.trim(),
          dueDate: args.dueDate,
        },
      );
      return { success: true, taskId: newTaskId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (name === "document_upsert") {
    let args: {
      documentId?: string;
      taskId?: string;
      title?: string;
      content?: string;
      type?: string;
    };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    const allowedTypes = ["deliverable", "note", "template", "reference"];
    if (
      !args.title?.trim() ||
      !args.content ||
      !args.type ||
      !allowedTypes.includes(args.type)
    ) {
      return {
        success: false,
        error:
          "title, content, and type (deliverable|note|template|reference) are required",
      };
    }
    try {
      const { documentId } = await client.action(
        api.service.actions.createDocumentFromAgent,
        {
          accountId,
          serviceToken,
          agentId,
          documentId: args.documentId as Id<"documents"> | undefined,
          taskId: args.taskId as Id<"tasks"> | undefined,
          title: args.title.trim(),
          content: args.content,
          type: args.type as "deliverable" | "note" | "template" | "reference",
        },
      );
      return { success: true, documentId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  return { success: false, error: `Unknown tool: ${name}` };
}
