/**
 * OpenResponses client-side tools for agents.
 * Schemas and execution for task_create, task_status, document_upsert.
 * Tools are attached only when the agent's effective behavior flags allow them.
 */

import { getConvexClient, api } from "../convex-client";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import {
  TASK_STATUS_TOOL_SCHEMA,
  createTaskStatusToolSchema,
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

/** Result of getToolCapabilitiesAndSchemas: capability labels for the prompt and schemas for OpenClaw. */
export interface ToolCapabilitiesAndSchemas {
  /** Human-readable capability labels (e.g. "change task status (task_status tool)") for the prompt. */
  capabilityLabels: string[];
  /** OpenResponses tool schemas to send in the request. */
  schemas: unknown[];
  /** True when task_status is in the allowed set (for status instructions in prompt). */
  hasTaskStatus: boolean;
  /** True when the agent is allowed to mark tasks as done. */
  canMarkDone: boolean;
}

/**
 * Single source of truth for allowed tools: returns both capability labels (for prompt) and tool schemas (for OpenClaw).
 * Use this so the prompt never advertises a capability we don't send as a tool.
 *
 * @param options - Capability flags and task context from delivery.
 * @returns Capability labels, tool schemas, and hasTaskStatus for prompt building.
 */
export function getToolCapabilitiesAndSchemas(options: {
  canCreateTasks: boolean;
  canModifyTaskStatus: boolean;
  canCreateDocuments: boolean;
  hasTaskContext: boolean;
  canMarkDone?: boolean;
}): ToolCapabilitiesAndSchemas {
  const capabilityLabels: string[] = [];
  const schemas: unknown[] = [];
  const canMarkDone = options.canMarkDone === true;

  if (options.hasTaskContext && options.canModifyTaskStatus) {
    capabilityLabels.push("change task status (task_status tool)");
    schemas.push(createTaskStatusToolSchema({ allowDone: canMarkDone }));
  }
  if (options.canCreateTasks) {
    capabilityLabels.push("create tasks (task_create tool)");
    schemas.push(TASK_CREATE_TOOL_SCHEMA);
  }
  if (options.canCreateDocuments) {
    capabilityLabels.push("create/update documents (document_upsert tool)");
    schemas.push(DOCUMENT_UPSERT_TOOL_SCHEMA);
  }

  return {
    capabilityLabels,
    schemas,
    hasTaskStatus: options.hasTaskContext && options.canModifyTaskStatus,
    canMarkDone,
  };
}

/**
 * Build the list of tool schemas to send to OpenClaw based on effective behavior flags and task context.
 * Prefer getToolCapabilitiesAndSchemas when building both prompt and payload so they stay in sync.
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
  return getToolCapabilitiesAndSchemas(options).schemas;
}

/**
 * Normalize priority inputs from tool calls.
 * Supports numeric values and common labels like "high".
 */
function normalizeTaskPriority(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  const map: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
    lowest: 5,
  };
  return map[normalized];
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
  canMarkDone?: boolean;
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
    canMarkDone,
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
    // When invoked from delivery, taskId param is the current notification's task; LLM may also send taskId in args.
    if (args.status === "done" && canMarkDone !== true) {
      return {
        success: false,
        error: "Forbidden: Not allowed to mark tasks as done",
      };
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
      const normalizedPriority = normalizeTaskPriority(args.priority);
      if (args.priority != null && normalizedPriority == null) {
        return {
          success: false,
          error:
            "Invalid priority: use 1-5 or one of critical|high|medium|low|lowest",
        };
      }
      const { taskId: newTaskId } = await client.action(
        api.service.actions.createTaskFromAgent,
        {
          accountId,
          serviceToken,
          agentId,
          title: args.title.trim(),
          description: args.description?.trim(),
          priority: normalizedPriority,
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
