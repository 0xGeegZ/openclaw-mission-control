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
        assigneeSlugs: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional agent slugs to assign after creation (e.g., ['jarvis','vision'])",
        },
      },
      required: ["title"],
    },
  },
};

/** OpenResponses function tool schema: assign agents to a task */
export const TASK_ASSIGN_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_assign",
    description:
      "Assign one or more agents to an existing task by slug. Use when delegating work to specific agents.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to assign" },
        assigneeSlugs: {
          type: "array",
          items: { type: "string" },
          description: "Agent slugs to assign",
        },
      },
      required: ["taskId", "assigneeSlugs"],
    },
  },
};

/** OpenResponses function tool schema: post message to another task */
export const TASK_MESSAGE_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_message",
    description:
      "Post a message to another task's thread. Use when you need to update or ask a question in a different task.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to post in" },
        content: { type: "string", description: "Message content (Markdown)" },
      },
      required: ["taskId", "content"],
    },
  },
};

/** OpenResponses function tool schema: list tasks */
export const TASK_LIST_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_list",
    description:
      "List tasks with optional filters. Use to get a snapshot of work by status or assignee.",
    parameters: {
      type: "object",
      properties: {
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
          description: "Optional status filter",
        },
        assigneeSlug: {
          type: "string",
          description: "Optional agent slug to filter assignments",
        },
        limit: {
          type: "number",
          description: "Optional result limit (default 50, max 200)",
        },
      },
    },
  },
};

/** OpenResponses function tool schema: get a task */
export const TASK_GET_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_get",
    description:
      "Fetch details for a single task by ID. Use when you need full task metadata.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to fetch" },
      },
      required: ["taskId"],
    },
  },
};

/** OpenResponses function tool schema: get a task thread */
export const TASK_THREAD_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_thread",
    description:
      "Fetch recent thread messages for a task. Use when you need context before replying.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to fetch thread for" },
        limit: {
          type: "number",
          description: "Optional message limit (default 50, max 200)",
        },
      },
      required: ["taskId"],
    },
  },
};

/** OpenResponses function tool schema: link a task to a GitHub PR bidirectionally */
export const TASK_LINK_PR_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "task_link_pr",
    description:
      "Link a task to a GitHub PR bidirectionally. Updates task with PR metadata and adds task reference to PR description.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to link" },
        prNumber: {
          type: "number",
          description: "GitHub PR number (e.g., 65 for PR #65)",
        },
      },
      required: ["taskId", "prNumber"],
    },
  },
};

/** OpenResponses function tool schema: request a response from other agents */
export const RESPONSE_REQUEST_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "response_request",
    description:
      "Request a response from other agents on the current task. Use this instead of @mentions to ask for follow-ups.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to request on" },
        recipientSlugs: {
          type: "array",
          items: { type: "string" },
          description: "Agent slugs to request a response from",
        },
        message: {
          type: "string",
          description: "Message to include in the response request",
        },
      },
      required: ["recipientSlugs", "message"],
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
  messageId?: string;
  data?: unknown;
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
  canMentionAgents?: boolean;
  canMarkDone?: boolean;
  isOrchestrator?: boolean;
}): ToolCapabilitiesAndSchemas {
  const capabilityLabels: string[] = [];
  const schemas: unknown[] = [];
  const canMarkDone = options.canMarkDone === true;
  const isOrchestrator = options.isOrchestrator === true;

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
  if (options.hasTaskContext && options.canMentionAgents === true) {
    capabilityLabels.push("request agent responses (response_request tool)");
    schemas.push(RESPONSE_REQUEST_TOOL_SCHEMA);
  }
  if (isOrchestrator) {
    capabilityLabels.push("assign agents (task_assign tool)");
    capabilityLabels.push("post to other tasks (task_message tool)");
    capabilityLabels.push("list tasks (task_list tool)");
    capabilityLabels.push("get task details (task_get tool)");
    capabilityLabels.push("read task threads (task_thread tool)");
    capabilityLabels.push("link tasks to PRs (task_link_pr tool)");
    schemas.push(
      TASK_ASSIGN_TOOL_SCHEMA,
      TASK_MESSAGE_TOOL_SCHEMA,
      TASK_LIST_TOOL_SCHEMA,
      TASK_GET_TOOL_SCHEMA,
      TASK_THREAD_TOOL_SCHEMA,
      TASK_LINK_PR_TOOL_SCHEMA,
    );
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
  canMentionAgents?: boolean;
  isOrchestrator?: boolean;
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
 * Resolve agent slugs to ids for tool calls.
 */
async function resolveAgentSlugs(params: {
  accountId: Id<"accounts">;
  serviceToken: string;
  slugs: string[];
}): Promise<Map<string, string>> {
  const client = getConvexClient();
  const agents = await client.action(api.service.actions.listAgents, {
    accountId: params.accountId,
    serviceToken: params.serviceToken,
  });
  const map = new Map<string, string>();
  for (const agent of agents) {
    if (agent?.slug) {
      map.set(String(agent.slug).toLowerCase(), String(agent._id));
    }
  }
  return new Map(
    params.slugs
      .map((slug) => slug.trim().replace(/^@/, "").toLowerCase())
      .filter((slug) => slug.length > 0)
      .map((slug) => [slug, map.get(slug) ?? ""]),
  );
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
  isOrchestrator?: boolean;
}): Promise<{
  success: boolean;
  error?: string;
  taskId?: string;
  documentId?: string;
  messageId?: string;
  data?: unknown;
}> {
  const {
    name,
    arguments: argsStr,
    agentId,
    accountId,
    serviceToken,
    taskId,
    canMarkDone,
    isOrchestrator,
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
      assigneeSlugs?: string[];
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
      if (args.assigneeSlugs?.length && isOrchestrator !== true) {
        return {
          success: false,
          error:
            "Forbidden: Only the orchestrator can assign agents during task creation",
        };
      }
      const normalizedPriority = normalizeTaskPriority(args.priority);
      if (args.priority != null && normalizedPriority == null) {
        return {
          success: false,
          error:
            "Invalid priority: use 1-5 or one of critical|high|medium|low|lowest",
        };
      }
      let assigneeIds: Id<"agents">[] = [];
      if (args.assigneeSlugs?.length) {
        const assigneeMap = await resolveAgentSlugs({
          accountId,
          serviceToken,
          slugs: args.assigneeSlugs,
        });
        assigneeIds = Array.from(assigneeMap.values()).filter(
          Boolean,
        ) as Id<"agents">[];
        const missing = Array.from(assigneeMap.entries())
          .filter((entry) => !entry[1])
          .map((entry) => entry[0]);
        if (missing.length > 0) {
          return {
            success: false,
            error: `Unknown assignee slugs: ${missing.join(", ")}`,
          };
        }
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
      if (assigneeIds.length > 0) {
        await client.action(api.service.actions.assignTaskFromAgent, {
          accountId,
          serviceToken,
          agentId,
          taskId: newTaskId,
          assignedAgentIds: assigneeIds,
        });
      }
      return { success: true, taskId: newTaskId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (name === "response_request") {
    let args: {
      taskId?: string;
      recipientSlugs?: string[];
      message?: string;
    };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    const resolvedTaskId = args.taskId ?? taskId;
    if (!resolvedTaskId) {
      return { success: false, error: "taskId is required" };
    }
    const normalizedSlugs = Array.isArray(args.recipientSlugs)
      ? args.recipientSlugs
          .map((slug) => slug.trim().replace(/^@/, ""))
          .filter((slug) => slug.length > 0)
      : [];
    if (normalizedSlugs.length === 0) {
      return { success: false, error: "recipientSlugs is required" };
    }
    if (!args.message?.trim()) {
      return { success: false, error: "message is required" };
    }
    try {
      const result = await client.action(
        api.service.actions.createResponseRequestNotifications,
        {
          accountId,
          serviceToken,
          requesterAgentId: agentId,
          taskId: resolvedTaskId as Id<"tasks">,
          recipientSlugs: normalizedSlugs,
          message: args.message.trim(),
        },
      );
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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

  if (name === "task_assign") {
    let args: { taskId?: string; assigneeSlugs?: string[] };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    if (!args.taskId?.trim()) {
      return { success: false, error: "taskId is required" };
    }
    if (!args.assigneeSlugs?.length) {
      return { success: false, error: "assigneeSlugs is required" };
    }
    try {
      const assigneeMap = await resolveAgentSlugs({
        accountId,
        serviceToken,
        slugs: args.assigneeSlugs,
      });
      const assigneeIds = Array.from(assigneeMap.values()).filter(Boolean);
      const missing = Array.from(assigneeMap.entries())
        .filter((entry) => !entry[1])
        .map((entry) => entry[0]);
      if (missing.length > 0) {
        return {
          success: false,
          error: `Unknown assignee slugs: ${missing.join(", ")}`,
        };
      }
      const { taskId: assignedTaskId } = await client.action(
        api.service.actions.assignTaskFromAgent,
        {
          accountId,
          serviceToken,
          agentId,
          taskId: args.taskId as Id<"tasks">,
          assignedAgentIds: assigneeIds as Id<"agents">[],
        },
      );
      return { success: true, taskId: assignedTaskId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (name === "task_message") {
    let args: { taskId?: string; content?: string };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    if (!args.taskId?.trim() || !args.content?.trim()) {
      return { success: false, error: "taskId and content are required" };
    }
    if (isOrchestrator !== true) {
      return {
        success: false,
        error: "Forbidden: Only the orchestrator can post task messages",
      };
    }
    try {
      const { messageId } = await client.action(
        api.service.actions.createTaskMessageForAgentTool,
        {
          accountId,
          serviceToken,
          agentId,
          taskId: args.taskId as Id<"tasks">,
          content: args.content.trim(),
        },
      );
      return { success: true, messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (name === "task_list") {
    let args: { status?: string; assigneeSlug?: string; limit?: number };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    try {
      const rawSlug = args.assigneeSlug?.trim();
      const assigneeSlug = rawSlug
        ? rawSlug.replace(/^@/, "").toLowerCase()
        : undefined;
      let assigneeAgentId: Id<"agents"> | undefined;
      if (assigneeSlug) {
        const assigneeMap = await resolveAgentSlugs({
          accountId,
          serviceToken,
          slugs: [assigneeSlug],
        });
        const resolvedId = assigneeMap.get(assigneeSlug) ?? "";
        if (!resolvedId) {
          return {
            success: false,
            error: `Unknown assignee slug: ${assigneeSlug}`,
          };
        }
        assigneeAgentId = resolvedId as Id<"agents">;
      }
      const tasks = await client.action(
        api.service.actions.listTasksForAgentTool,
        {
          accountId,
          serviceToken,
          agentId,
          status: args.status as
            | "inbox"
            | "assigned"
            | "in_progress"
            | "review"
            | "done"
            | "blocked"
            | undefined,
          assigneeAgentId,
          limit: args.limit,
        },
      );
      return { success: true, data: { tasks } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (name === "task_get") {
    let args: { taskId?: string };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    if (!args.taskId?.trim()) {
      return { success: false, error: "taskId is required" };
    }
    try {
      const task = await client.action(
        api.service.actions.getTaskForAgentTool,
        {
          accountId,
          serviceToken,
          agentId,
          taskId: args.taskId as Id<"tasks">,
        },
      );
      return { success: true, data: { task } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (name === "task_thread") {
    let args: { taskId?: string; limit?: number };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    if (!args.taskId?.trim()) {
      return { success: false, error: "taskId is required" };
    }
    try {
      const thread = await client.action(
        api.service.actions.listTaskThreadForAgentTool,
        {
          accountId,
          serviceToken,
          agentId,
          taskId: args.taskId as Id<"tasks">,
          limit: args.limit,
        },
      );
      return { success: true, data: { thread } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (name === "task_link_pr") {
    let args: { taskId?: string; prNumber?: number };
    try {
      args = JSON.parse(argsStr || "{}") as typeof args;
    } catch {
      return { success: false, error: "Invalid JSON arguments" };
    }
    if (!args.taskId?.trim()) {
      return { success: false, error: "taskId is required" };
    }
    if (args.prNumber == null || !Number.isFinite(args.prNumber)) {
      return { success: false, error: "prNumber is required and must be numeric" };
    }
    if (!isOrchestrator) {
      return {
        success: false,
        error: "Forbidden: Only the orchestrator can link tasks to PRs",
      };
    }
    try {
      await client.action(api.service.actions.linkTaskToPrForAgentTool, {
        accountId,
        serviceToken,
        agentId,
        taskId: args.taskId as Id<"tasks">,
        prNumber: args.prNumber,
      });
      return { success: true, data: { taskId: args.taskId, prNumber: args.prNumber } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  return { success: false, error: `Unknown tool: ${name}` };
}
