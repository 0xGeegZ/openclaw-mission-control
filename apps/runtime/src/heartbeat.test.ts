import { describe, it, expect } from "vitest";
import {
  buildHeartbeatMessage,
  mergeHeartbeatTasks,
  normalizeHeartbeatResponse,
  shouldRequestAssigneeResponse,
  sortHeartbeatTasks,
} from "./heartbeat";
import type { Doc, Id } from "@packages/backend/convex/_generated/dataModel";

type TaskDoc = Doc<"tasks">;

/** Build a minimal task document for heartbeat tests. */
function buildTask(overrides: Partial<TaskDoc> = {}): TaskDoc {
  return {
    _id: "task1" as TaskDoc["_id"],
    _creationTime: Date.now(),
    accountId: "acc1" as TaskDoc["accountId"],
    title: "Task title",
    description: "Task description",
    status: "in_progress",
    priority: 3,
    assignedUserIds: [],
    assignedAgentIds: [],
    labels: [],
    createdBy: "agent-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("mergeHeartbeatTasks", () => {
  it("deduplicates tasks by id", () => {
    const taskA = buildTask({ _id: "task-a" as TaskDoc["_id"] });
    const taskADupe = buildTask({
      _id: "task-a" as TaskDoc["_id"],
      title: "Task A updated",
    });
    const taskB = buildTask({ _id: "task-b" as TaskDoc["_id"] });
    const merged = mergeHeartbeatTasks([[taskA], [taskADupe, taskB]]);
    expect(merged).toHaveLength(2);
    const titles = merged.map((task) => task.title).sort();
    expect(titles).toEqual(["Task A updated", "Task title"]);
  });
});

describe("sortHeartbeatTasks", () => {
  it("prioritizes status rank then newest updates by default", () => {
    const inProgressOld = buildTask({
      _id: "task-in-progress-old" as TaskDoc["_id"],
      status: "in_progress",
      updatedAt: 1000,
    });
    const assignedNew = buildTask({
      _id: "task-assigned-new" as TaskDoc["_id"],
      status: "assigned",
      updatedAt: 5000,
    });
    const inProgressNew = buildTask({
      _id: "task-in-progress-new" as TaskDoc["_id"],
      status: "in_progress",
      updatedAt: 8000,
    });

    const sorted = sortHeartbeatTasks([
      inProgressOld,
      assignedNew,
      inProgressNew,
    ]);
    expect(sorted.map((task) => task._id)).toEqual([
      "task-in-progress-new",
      "task-in-progress-old",
      "task-assigned-new",
    ]);
  });

  it("can prioritize stale tasks first with custom status order", () => {
    const blockedStale = buildTask({
      _id: "task-blocked-stale" as TaskDoc["_id"],
      status: "blocked",
      updatedAt: 1000,
    });
    const blockedFresh = buildTask({
      _id: "task-blocked-fresh" as TaskDoc["_id"],
      status: "blocked",
      updatedAt: 5000,
    });
    const inProgress = buildTask({
      _id: "task-in-progress" as TaskDoc["_id"],
      status: "in_progress",
      updatedAt: 2000,
    });

    const sorted = sortHeartbeatTasks(
      [blockedFresh, inProgress, blockedStale],
      {
        statusPriority: ["blocked", "in_progress", "assigned"],
        preferStale: true,
      },
    );
    expect(sorted.map((task) => task._id)).toEqual([
      "task-blocked-stale",
      "task-blocked-fresh",
      "task-in-progress",
    ]);
  });

  it("keeps in_progress first for orchestrator ordering", () => {
    const blockedVeryStale = buildTask({
      _id: "task-blocked-very-stale" as TaskDoc["_id"],
      status: "blocked",
      updatedAt: 1000,
    });
    const inProgressLessStale = buildTask({
      _id: "task-in-progress-less-stale" as TaskDoc["_id"],
      status: "in_progress",
      updatedAt: 2000,
    });
    const assignedStale = buildTask({
      _id: "task-assigned-stale" as TaskDoc["_id"],
      status: "assigned",
      updatedAt: 500,
    });

    const sorted = sortHeartbeatTasks(
      [blockedVeryStale, assignedStale, inProgressLessStale],
      {
        statusPriority: ["in_progress", "assigned", "blocked"],
        preferStale: true,
      },
    );
    expect(sorted.map((task) => task._id)).toEqual([
      "task-in-progress-less-stale",
      "task-assigned-stale",
      "task-blocked-very-stale",
    ]);
  });
});

describe("shouldRequestAssigneeResponse", () => {
  it("requests follow-up when assigned task is stale", () => {
    const task = buildTask({
      _id: "task-stale" as TaskDoc["_id"],
      status: "assigned",
      assignedAgentIds: ["agent-1" as TaskDoc["assignedAgentIds"][number]],
      updatedAt: 1000,
      createdAt: 1000,
    });
    const shouldRequest = shouldRequestAssigneeResponse({
      task,
      lastAssigneeReplyAt: null,
      nowMs: 1000 + 3 * 60 * 60 * 1000 + 1,
    });
    expect(shouldRequest).toBe(true);
  });

  it("does not request follow-up when assignee replied recently", () => {
    const task = buildTask({
      _id: "task-recent" as TaskDoc["_id"],
      status: "in_progress",
      assignedAgentIds: ["agent-1" as TaskDoc["assignedAgentIds"][number]],
      updatedAt: 1000,
      createdAt: 1000,
    });
    const shouldRequest = shouldRequestAssigneeResponse({
      task,
      lastAssigneeReplyAt: 10_000,
      nowMs: 10_000 + 30 * 60 * 1000,
    });
    expect(shouldRequest).toBe(false);
  });

  it("does not request follow-up for tasks without assignees", () => {
    const task = buildTask({
      _id: "task-no-assignee" as TaskDoc["_id"],
      status: "blocked",
      assignedAgentIds: [],
      updatedAt: 1000,
      createdAt: 1000,
    });
    const shouldRequest = shouldRequestAssigneeResponse({
      task,
      lastAssigneeReplyAt: null,
      nowMs: 1000 + 8 * 60 * 60 * 1000,
    });
    expect(shouldRequest).toBe(false);
  });
});

describe("buildHeartbeatMessage", () => {
  it("renders orchestrator guidance with tracked tasks", () => {
    const task = buildTask({
      _id: "task-orch" as TaskDoc["_id"],
      title: "Orchestrator task",
      status: "in_progress",
    });
    const message = buildHeartbeatMessage({
      focusTask: task,
      tasks: [task],
      isOrchestrator: true,
    });
    expect(message).toContain("Tracked tasks:");
    expect(message).toContain(
      "As the orchestrator, follow up on in_progress/assigned/blocked tasks",
    );
    expect(message).toContain("Task ID: task-orch");
  });

  it("uses assigned task phrasing for non-orchestrator", () => {
    const message = buildHeartbeatMessage({
      focusTask: null,
      tasks: [],
      isOrchestrator: false,
    });
    expect(message).toContain("Assigned tasks:");
    expect(message).toContain("No assigned tasks found.");
    expect(message).not.toContain("As the orchestrator");
  });

  it("includes follow-up-per-task and task tool/API instructions for orchestrator when tracked tasks exist", () => {
    const task = buildTask({
      _id: "task-follow" as TaskDoc["_id"],
      title: "Follow-up task",
      status: "assigned",
    });
    const message = buildHeartbeatMessage({
      focusTask: task,
      tasks: [task],
      isOrchestrator: true,
      taskStatusBaseUrl: "http://runtime:3000",
    });
    expect(message).toContain(
      "Across tracked tasks, keep follow-ups moving and avoid starvation",
    );
    expect(message).toContain("Prioritize the stalest in_progress task first");
    expect(message).toContain("task_load (or task_get/task_thread/task_search)");
    expect(message).toContain("task_message thread comment");
    expect(message).toContain("response_request");
    expect(message).toContain("If either step fails, report BLOCKED");
    expect(message).toContain("http://runtime:3000/agent/task-search");
    expect(message).toContain("http://runtime:3000/agent/task-message");
    expect(message).toContain("http://runtime:3000/agent/response-request");
    expect(message).toContain("Take up to 3 atomic follow-ups per heartbeat");
  });

  it("includes recent focus task thread updates when provided", () => {
    const task = buildTask({
      _id: "task-thread" as TaskDoc["_id"],
      title: "Task with thread",
      status: "in_progress",
    });
    const message = buildHeartbeatMessage({
      focusTask: task,
      tasks: [task],
      isOrchestrator: false,
      focusTaskThread: [
        {
          messageId: "msg1" as unknown as Id<"messages">,
          authorType: "user",
          authorId: "user_1",
          authorName: "Guillaume",
          content: "Please prioritize this now.",
          createdAt: 1000,
        },
      ],
    });
    expect(message).toContain("Recent focus task thread updates:");
    expect(message).toContain("Guillaume [user]");
    expect(message).toContain("Please prioritize this now.");
  });
});

describe("normalizeHeartbeatResponse", () => {
  it("keeps strict HEARTBEAT_OK as no-op", () => {
    const normalized = normalizeHeartbeatResponse("HEARTBEAT_OK");
    expect(normalized).toEqual({
      responseText: "HEARTBEAT_OK",
      isHeartbeatOk: true,
      wasAmbiguousHeartbeatOk: false,
    });
  });

  it("normalizes ambiguous HEARTBEAT_OK mixed output to strict no-op", () => {
    const normalized = normalizeHeartbeatResponse(
      "Did some checks.\nHEARTBEAT_OK",
    );
    expect(normalized).toEqual({
      responseText: "HEARTBEAT_OK",
      isHeartbeatOk: true,
      wasAmbiguousHeartbeatOk: true,
    });
  });

  it("keeps normal action text as non-noop", () => {
    const normalized = normalizeHeartbeatResponse(
      "Implemented fix and posted update.\nTask ID: task1",
    );
    expect(normalized).toEqual({
      responseText: "Implemented fix and posted update.\nTask ID: task1",
      isHeartbeatOk: false,
      wasAmbiguousHeartbeatOk: false,
    });
  });
});
