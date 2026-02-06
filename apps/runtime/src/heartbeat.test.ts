import { describe, it, expect } from "vitest";
import { buildHeartbeatMessage, mergeHeartbeatTasks } from "./heartbeat";
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

describe("buildHeartbeatMessage", () => {
  it("renders orchestrator guidance with tracked tasks", () => {
    const task = buildTask({
      _id: "task-orch" as TaskDoc["_id"],
      title: "Orchestrator task",
      status: "review",
    });
    const message = buildHeartbeatMessage({
      focusTask: task,
      tasks: [task],
      isOrchestrator: true,
    });
    expect(message).toContain("Tracked tasks:");
    expect(message).toContain(
      "As the orchestrator, follow up on in_progress/review tasks",
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
});
