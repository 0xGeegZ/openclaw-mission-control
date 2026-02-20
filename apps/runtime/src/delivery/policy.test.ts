/**
 * Unit tests for delivery policy: shouldDeliverToAgent, shouldRetryNoResponseForNotification,
 * orchestrator silent-by-default, and role/QA helpers.
 */
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { describe, it, expect } from "vitest";
import type { DeliveryContext } from "./types";
import {
  agentCanReview,
  canAgentMarkDone,
  isOrchestratorChatTask,
  isRecipientInMultiAssigneeTask,
  shouldDeliverToAgent,
  shouldPersistNoResponseFallback,
  shouldPersistOrchestratorThreadAck,
  shouldRetryNoResponseForNotification,
  TASK_STATUSES_SKIP_STATUS_CHANGE,
} from "./policy";

const aid = (s: string): Id<"agents"> => s as Id<"agents">;
const tid = (s: string): Id<"tasks"> => s as Id<"tasks">;
const nid = (s: string): Id<"notifications"> => s as Id<"notifications">;
const accId = (s: string): Id<"accounts"> => s as Id<"accounts">;
const mid = (s: string): Id<"messages"> => s as Id<"messages">;

function buildContext(
  overrides: Partial<DeliveryContext> = {},
): DeliveryContext {
  const base: DeliveryContext = {
    notification: {
      _id: nid("n1"),
      type: "thread_update",
      title: "Update",
      body: "Body",
      recipientId: "agent-a",
      accountId: accId("acc1"),
    },
    agent: { _id: aid("agent-a"), role: "Developer", name: "Engineer" },
    task: {
      _id: tid("task1"),
      status: "in_progress",
      title: "Task",
      assignedAgentIds: [aid("agent-a")],
    },
    message: {
      _id: mid("m1"),
      authorType: "agent",
      authorId: "agent-b",
      content: "Done",
    },
    thread: [],
    sourceNotificationType: null,
    orchestratorAgentId: null,
    primaryUserMention: null,
    mentionableAgents: [],
    assignedAgents: [],
    effectiveBehaviorFlags: {},
    repositoryDoc: null,
    globalBriefingDoc: null,
    taskOverview: null,
  };
  return { ...base, ...overrides } as DeliveryContext;
}

describe("policy matrix", () => {
  it("TASK_STATUSES_SKIP_STATUS_CHANGE includes done and blocked", () => {
    expect(TASK_STATUSES_SKIP_STATUS_CHANGE.has("done")).toBe(true);
    expect(TASK_STATUSES_SKIP_STATUS_CHANGE.has("blocked")).toBe(true);
    expect(TASK_STATUSES_SKIP_STATUS_CHANGE.has("in_progress")).toBe(false);
  });

  it("shouldRetryNoResponseForNotification returns true for assignment, mention, response_request", () => {
    expect(
      shouldRetryNoResponseForNotification(
        buildContext({
          notification: { ...buildContext().notification!, type: "assignment" },
        }),
      ),
    ).toBe(true);
    expect(
      shouldRetryNoResponseForNotification(
        buildContext({
          notification: { ...buildContext().notification!, type: "mention" },
        }),
      ),
    ).toBe(true);
    expect(
      shouldRetryNoResponseForNotification(
        buildContext({
          notification: {
            ...buildContext().notification!,
            type: "response_request",
          },
        }),
      ),
    ).toBe(true);
  });

  it("shouldRetryNoResponseForNotification returns false for thread_update from agent", () => {
    const ctx = buildContext({
      notification: { ...buildContext().notification!, type: "thread_update" },
      message: {
        _id: mid("m1"),
        authorType: "agent",
        authorId: "agent-b",
        content: "Ok",
      },
    });
    expect(shouldRetryNoResponseForNotification(ctx)).toBe(false);
  });

  it("shouldPersistOrchestratorThreadAck is always false (silent-by-default)", () => {
    const ctx = buildContext({
      notification: {
        ...buildContext().notification!,
        type: "thread_update",
        recipientId: "orch",
      },
      orchestratorAgentId: aid("orch"),
      agent: { _id: aid("orch"), role: "Squad Lead", name: "Orchestrator" },
      task: {
        _id: tid("t1"),
        status: "in_progress",
        title: "T",
        assignedAgentIds: [aid("engineer")],
      },
      message: {
        _id: mid("m1"),
        authorType: "agent",
        authorId: "engineer",
        content: "Update",
      },
    });
    expect(shouldPersistOrchestratorThreadAck(ctx)).toBe(false);
  });

  it("shouldPersistNoResponseFallback is false for all types (fallback not posted to thread)", () => {
    expect(
      shouldPersistNoResponseFallback({ notificationType: "assignment" }),
    ).toBe(false);
    expect(
      shouldPersistNoResponseFallback({ notificationType: "mention" }),
    ).toBe(false);
    expect(
      shouldPersistNoResponseFallback({ notificationType: "response_request" }),
    ).toBe(false);
    expect(
      shouldPersistNoResponseFallback({ notificationType: "thread_update" }),
    ).toBe(false);
    expect(
      shouldPersistNoResponseFallback({ notificationType: "status_change" }),
    ).toBe(false);
  });
});

describe("shouldDeliverToAgent", () => {
  it("returns false for thread_update when task is done", () => {
    const ctx = buildContext({
      notification: { ...buildContext().notification!, type: "thread_update" },
      task: {
        _id: tid("t1"),
        status: "done",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns true for assignment", () => {
    const ctx = buildContext({
      notification: { ...buildContext().notification!, type: "assignment" },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("orchestrator chat: only orchestrator recipient receives", () => {
    const ctx = buildContext({
      task: {
        _id: tid("t1"),
        status: "in_progress",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
        labels: ["system:orchestrator-chat"],
      },
      notification: {
        ...buildContext().notification!,
        type: "thread_update",
        recipientType: "agent",
        recipientId: "orch",
      },
      orchestratorAgentId: aid("orch"),
      agent: { _id: aid("orch"), role: "Squad Lead", name: "Orchestrator" },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
    const ctxOther = buildContext({
      ...ctx,
      notification: { ...ctx.notification, recipientId: "agent-a" },
      agent: { _id: aid("agent-a"), role: "Developer", name: "Engineer" },
    });
    expect(shouldDeliverToAgent(ctxOther)).toBe(false);
  });
});

describe("isOrchestratorChatTask", () => {
  it("returns true when task has system:orchestrator-chat label", () => {
    expect(
      isOrchestratorChatTask({
        _id: tid("t1"),
        status: "in_progress",
        title: "T",
        labels: ["system:orchestrator-chat"],
      }),
    ).toBe(true);
  });
  it("returns false when label is missing", () => {
    expect(
      isOrchestratorChatTask({
        _id: tid("t1"),
        status: "in_progress",
        title: "T",
      }),
    ).toBe(false);
  });
});

describe("agentCanReview", () => {
  it("returns true when effectiveBehaviorFlags.canReviewTasks is true", () => {
    expect(
      agentCanReview(
        buildContext({ effectiveBehaviorFlags: { canReviewTasks: true } }),
      ),
    ).toBe(true);
  });
  it("returns false when canReviewTasks is false or missing", () => {
    expect(
      agentCanReview(
        buildContext({ effectiveBehaviorFlags: { canReviewTasks: false } }),
      ),
    ).toBe(false);
    expect(agentCanReview(buildContext({ effectiveBehaviorFlags: {} }))).toBe(
      false,
    );
  });
});

describe("canAgentMarkDone", () => {
  it("returns false when task is not in review", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "in_progress",
        canMarkDone: true,
      }),
    ).toBe(false);
  });
  it("returns false when canMarkDone is false even if status is review", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "review",
        canMarkDone: false,
      }),
    ).toBe(false);
  });
  it("returns true when task is review and canMarkDone is true", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "review",
        canMarkDone: true,
      }),
    ).toBe(true);
  });
});

describe("isRecipientInMultiAssigneeTask", () => {
  it("returns true when task has 2+ assignees and recipient agent is one of them", () => {
    expect(
      isRecipientInMultiAssigneeTask(
        buildContext({
          task: {
            _id: tid("t1"),
            status: "in_progress",
            title: "T",
            assignedAgentIds: [aid("agent-a"), aid("agent-b")],
          },
          agent: { _id: aid("agent-a"), role: "Engineer", name: "A" },
        }),
      ),
    ).toBe(true);
  });
  it("returns false when task has only one assignee", () => {
    expect(
      isRecipientInMultiAssigneeTask(
        buildContext({
          task: {
            _id: tid("t1"),
            status: "in_progress",
            title: "T",
            assignedAgentIds: [aid("agent-a")],
          },
          agent: { _id: aid("agent-a"), role: "Engineer", name: "A" },
        }),
      ),
    ).toBe(false);
  });
  it("returns false when task has 2+ assignees but recipient is not in the list", () => {
    expect(
      isRecipientInMultiAssigneeTask(
        buildContext({
          task: {
            _id: tid("t1"),
            status: "in_progress",
            title: "T",
            assignedAgentIds: [aid("agent-a"), aid("agent-b")],
          },
          agent: { _id: aid("agent-c"), role: "Engineer", name: "C" },
        }),
      ),
    ).toBe(false);
  });
  it("returns false when task or agent is missing", () => {
    expect(
      isRecipientInMultiAssigneeTask(buildContext({ task: null, agent: null })),
    ).toBe(false);
    expect(
      isRecipientInMultiAssigneeTask(
        buildContext({
          task: {
            _id: tid("t1"),
            status: "in_progress",
            title: "T",
            assignedAgentIds: [],
          },
          agent: { _id: aid("agent-a"), name: "A" },
        }),
      ),
    ).toBe(false);
  });
});
