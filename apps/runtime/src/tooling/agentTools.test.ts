/**
 * Unit tests for getToolCapabilitiesAndSchemas: single source of truth for capability labels and tool schemas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getToolCapabilitiesAndSchemas,
  getToolSchemasForCapabilities,
  executeAgentTool,
} from "./agentTools";
import { getConvexClient } from "../convex-client";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

const mockAction = vi.fn();
vi.mock("../convex-client", () => ({
  getConvexClient: vi.fn(),
  api: {
    service: {
      actions: {
        listAgents: "listAgents",
        createTaskFromAgent: "createTaskFromAgent",
        assignTaskFromAgent: "assignTaskFromAgent",
        searchTasksForAgentTool: "searchTasksForAgentTool",
        loadTaskDetailsForAgentTool: "loadTaskDetailsForAgentTool",
        linkTaskToPrForAgentTool: "linkTaskToPrForAgentTool",
        getAgentSkillsForTool: "getAgentSkillsForTool",
        createResponseRequestNotifications: "createResponseRequestNotifications",
      },
    },
  },
}));

vi.mock("./taskDeleteTool", () => ({
  executeTaskDeleteTool: vi.fn(),
  TASK_DELETE_TOOL_SCHEMA: {
    type: "function" as const,
    function: { name: "task_delete" },
  },
}));

beforeEach(() => {
  vi.mocked(getConvexClient).mockReturnValue({ action: mockAction } as never);
  mockAction.mockReset();
});

function schemaNames(schemas: unknown[]): string[] {
  return schemas
    .map((s) => {
      const schema = s as { function?: { name?: string } };
      return schema?.function?.name;
    })
    .filter((n): n is string => typeof n === "string");
}

describe("getToolCapabilitiesAndSchemas", () => {
  it("returns task_status and task_update only when hasTaskContext and canModifyTaskStatus", () => {
    const withTask = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: false,
      hasTaskContext: true,
    });
    expect(withTask.hasTaskStatus).toBe(true);
    expect(withTask.capabilityLabels).toContain(
      "change task status (task_status tool)",
    );
    expect(withTask.capabilityLabels).toContain(
      "update task fields (task_update tool): title/description/priority/labels/assignees/status/dueDate",
    );
    expect(schemaNames(withTask.schemas)).toContain("task_status");
    expect(schemaNames(withTask.schemas)).toContain("task_update");

    const noTask = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: false,
      hasTaskContext: false,
    });
    expect(noTask.hasTaskStatus).toBe(false);
    expect(noTask.capabilityLabels).not.toContain(
      "change task status (task_status tool)",
    );
    expect(noTask.capabilityLabels).not.toContain(
      "update task fields (task_update tool): title/description/priority/labels/assignees/status/dueDate",
    );
    expect(schemaNames(noTask.schemas)).not.toContain("task_status");
    expect(schemaNames(noTask.schemas)).not.toContain("task_update");

    const noPermission = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: true,
    });
    expect(noPermission.hasTaskStatus).toBe(false);
    expect(schemaNames(noPermission.schemas)).not.toContain("task_status");
    expect(schemaNames(noPermission.schemas)).not.toContain("task_update");
  });

  it("returns task_create when canCreateTasks is true", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: true,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: false,
    });
    expect(result.capabilityLabels).toContain(
      "create tasks (task_create tool)",
    );
    expect(schemaNames(result.schemas)).toContain("task_create");
  });

  it("returns document_upsert when canCreateDocuments is true", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: true,
      hasTaskContext: false,
    });
    expect(result.capabilityLabels).toContain(
      "create/update documents (document_upsert tool)",
    );
    expect(schemaNames(result.schemas)).toContain("document_upsert");
  });

  it("returns response_request when canMentionAgents and hasTaskContext", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      canMentionAgents: true,
      hasTaskContext: true,
    });
    expect(result.capabilityLabels).toContain(
      "request agent responses (response_request tool)",
    );
    expect(schemaNames(result.schemas)).toContain("response_request");

    const noTask = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      canMentionAgents: true,
      hasTaskContext: false,
    });
    expect(schemaNames(noTask.schemas)).not.toContain("response_request");
  });

  it("includes orchestrator-only tools when isOrchestrator is true", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: false,
      isOrchestrator: true,
    });
    const names = schemaNames(result.schemas);
    expect(names).toContain("task_assign");
    expect(names).toContain("task_message");
    expect(names).toContain("task_list");
    expect(names).toContain("task_get");
    expect(names).toContain("task_thread");
    expect(names).toContain("task_search");
    expect(names).toContain("task_delete");
    expect(names).toContain("task_link_pr");
  });

  it("keeps capability labels and schemas in sync", () => {
    const options = {
      canCreateTasks: true,
      canModifyTaskStatus: true,
      canCreateDocuments: true,
      canMentionAgents: true,
      hasTaskContext: true,
    };
    const result = getToolCapabilitiesAndSchemas(options);
    const toolLabels = result.capabilityLabels.filter((l) =>
      l.includes(" tool)"),
    );
    expect(toolLabels.length).toBe(result.schemas.length);
    expect(schemaNames(result.schemas).length).toBe(result.schemas.length);
  });

  it("returns empty when no tool capabilities", () => {
    const result = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: false,
    });
    expect(result.capabilityLabels).toEqual([
      "query agent skills (get_agent_skills tool)",
      "load task details with thread (task_load tool)",
    ]);
    expect(schemaNames(result.schemas)).toEqual([
      "get_agent_skills",
      "task_load",
    ]);
    expect(result.hasTaskStatus).toBe(false);
  });
});

describe("executeAgentTool", () => {
  const baseParams = {
    agentId: "agent1" as Id<"agents">,
    accountId: "acc1" as Id<"accounts">,
    serviceToken: "token",
  };

  it("validates task_search requires query and orchestrator", async () => {
    const missingQuery = await executeAgentTool({
      ...baseParams,
      name: "task_search",
      arguments: "{}",
    });
    expect(missingQuery).toEqual({
      success: false,
      error: "query is required",
    });

    const nonOrchestrator = await executeAgentTool({
      ...baseParams,
      name: "task_search",
      arguments: JSON.stringify({ query: "db" }),
      isOrchestrator: false,
    });
    expect(nonOrchestrator).toEqual({
      success: false,
      error: "Forbidden: Only the orchestrator can search tasks",
    });
  });

  it("executes task_search for orchestrator", async () => {
    mockAction.mockResolvedValue([{ _id: "task1" }]);
    const result = await executeAgentTool({
      ...baseParams,
      name: "task_search",
      arguments: JSON.stringify({ query: "db", limit: 5 }),
      isOrchestrator: true,
    });
    expect(result.success).toBe(true);
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        query: "db",
        limit: 5,
      }),
    );
  });

  it("validates task_load requires taskId", async () => {
    const result = await executeAgentTool({
      ...baseParams,
      name: "task_load",
      arguments: "{}",
    });
    expect(result).toEqual({ success: false, error: "taskId is required" });
  });

  it("executes task_load with messageLimit", async () => {
    mockAction.mockResolvedValue({ task: { _id: "task1" }, thread: [] });
    const result = await executeAgentTool({
      ...baseParams,
      name: "task_load",
      arguments: JSON.stringify({ taskId: "task1", messageLimit: 12 }),
    });
    expect(result.success).toBe(true);
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "task1",
        messageLimit: 12,
      }),
    );
  });

  it("validates task_link_pr requires taskId and prNumber", async () => {
    const missingTaskId = await executeAgentTool({
      ...baseParams,
      name: "task_link_pr",
      arguments: JSON.stringify({ prNumber: 42 }),
      isOrchestrator: true,
    });
    expect(missingTaskId).toEqual({
      success: false,
      error: "taskId is required",
    });

    const missingPr = await executeAgentTool({
      ...baseParams,
      name: "task_link_pr",
      arguments: JSON.stringify({ taskId: "task1" }),
      isOrchestrator: true,
    });
    expect(missingPr).toEqual({
      success: false,
      error: "prNumber is required and must be numeric",
    });
  });

  it("executes task_link_pr for orchestrator", async () => {
    mockAction.mockResolvedValue({ success: true });
    const result = await executeAgentTool({
      ...baseParams,
      name: "task_link_pr",
      arguments: JSON.stringify({ taskId: "task1", prNumber: 99 }),
      isOrchestrator: true,
    });
    expect(result.success).toBe(true);
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: "task1", prNumber: 99 }),
    );
  });

  it("validates response_request payload", async () => {
    const missingRecipients = await executeAgentTool({
      ...baseParams,
      name: "response_request",
      arguments: JSON.stringify({ taskId: "task1", message: "ping" }),
    });
    expect(missingRecipients).toEqual({
      success: false,
      error: "recipientSlugs is required",
    });

    const missingMessage = await executeAgentTool({
      ...baseParams,
      name: "response_request",
      arguments: JSON.stringify({
        taskId: "task1",
        recipientSlugs: ["qa"],
      }),
    });
    expect(missingMessage).toEqual({
      success: false,
      error: "message is required",
    });
  });

  it("executes response_request with taskId fallback", async () => {
    mockAction.mockResolvedValue({ notificationIds: ["notif1"] });
    const result = await executeAgentTool({
      ...baseParams,
      name: "response_request",
      arguments: JSON.stringify({
        recipientSlugs: ["qa", "@eng"],
        message: "Need review",
      }),
      taskId: "task1" as Id<"tasks">,
    });
    expect(result.success).toBe(true);
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: "task1",
        recipientSlugs: ["qa", "eng"],
        message: "Need review",
      }),
    );
  });

  it("keeps orchestrator out of delegated task assignees", async () => {
    mockAction
      .mockResolvedValueOnce([
        { _id: "agent1", slug: "orchestrator" },
        { _id: "agent2", slug: "engineer" },
      ])
      .mockResolvedValueOnce({ taskId: "task1" })
      .mockResolvedValueOnce({ taskId: "task1" });

    const result = await executeAgentTool({
      ...baseParams,
      name: "task_create",
      arguments: JSON.stringify({
        title: "Delegate implementation",
        status: "in_progress",
        assigneeSlugs: ["orchestrator", "engineer"],
      }),
      isOrchestrator: true,
    });

    expect(result).toEqual({ success: true, taskId: "task1" });
    expect(mockAction).toHaveBeenCalledTimes(3);

    const createCall = mockAction.mock.calls.find(([, payload]) => {
      return (payload as { title?: string }).title === "Delegate implementation";
    });
    expect(createCall).toBeDefined();
    expect(createCall?.[1]).toMatchObject({
      title: "Delegate implementation",
      status: "inbox",
    });

    const assignCall = mockAction.mock.calls.find(([, payload]) => {
      return (payload as { taskId?: string }).taskId === "task1";
    });
    expect(assignCall).toBeDefined();
    expect(assignCall?.[1]).toMatchObject({
      taskId: "task1",
      assignedAgentIds: ["agent2"],
    });
  });

  it("forces orchestrator-created assigned tasks to start in inbox", async () => {
    mockAction.mockResolvedValueOnce({ taskId: "task2" });

    const result = await executeAgentTool({
      ...baseParams,
      name: "task_create",
      arguments: JSON.stringify({
        title: "Backlog triage",
        status: "assigned",
      }),
      isOrchestrator: true,
    });

    expect(result).toEqual({ success: true, taskId: "task2" });
    expect(mockAction).toHaveBeenCalledTimes(1);
    expect(mockAction.mock.calls[0]?.[1]).toMatchObject({
      title: "Backlog triage",
      status: "inbox",
    });
  });

  it("executes get_agent_skills with optional agentId", async () => {
    mockAction.mockResolvedValue([{ agentId: "agent1", skillIds: [] }]);
    const result = await executeAgentTool({
      ...baseParams,
      name: "get_agent_skills",
      arguments: JSON.stringify({ agentId: "agent1" }),
    });
    expect(result.success).toBe(true);
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        queryAgentId: "agent1",
      }),
    );
  });
});

describe("getToolSchemasForCapabilities", () => {
  it("returns same schemas as getToolCapabilitiesAndSchemas for same options", () => {
    const options = {
      canCreateTasks: true,
      canModifyTaskStatus: true,
      canCreateDocuments: true,
      canMentionAgents: true,
      hasTaskContext: true,
    };
    const fromHelper = getToolCapabilitiesAndSchemas(options).schemas;
    const fromLegacy = getToolSchemasForCapabilities(options);
    expect(fromLegacy).toEqual(fromHelper);
  });
});
