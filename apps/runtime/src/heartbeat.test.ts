import { describe, it, expect } from "vitest";
import {
  buildHeartbeatMessage,
  mergeHeartbeatTasks,
  shouldRequestAssigneeResponse,
  sortHeartbeatTasks,
} from "./heartbeat";
import type { Doc } from "@packages/backend/convex/_generated/dataModel";

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
      "As the orchestrator, follow up on assigned/in_progress/blocked tasks",
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
    expect(message).toContain("Prioritize the stalest blocked/in_progress");
    expect(message).toContain("task_search or task_get / task_load");
    expect(message).toContain("response_request");
    expect(message).toContain("You must request a response from assignees");
    expect(message).toContain("http://runtime:3000/agent/task-search");
    expect(message).toContain("only one atomic action per heartbeat");
  });
});
