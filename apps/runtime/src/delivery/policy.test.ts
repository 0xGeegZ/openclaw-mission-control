/**
 * Unit tests for delivery policy: shouldDeliverToAgent, shouldRetryNoResponseForNotification,
 * orchestrator silent-by-default, and role/QA helpers.
 */
import { describe, it, expect } from "vitest";
import type { DeliveryContext } from "./types";
import {
  canAgentMarkDone,
  isOrchestratorChatTask,
  isQaAgentProfile,
  isReviewerRole,
  shouldDeliverToAgent,
  shouldPersistNoResponseFallback,
  shouldPersistOrchestratorThreadAck,
  shouldRetryNoResponseForNotification,
  TASK_STATUSES_SKIP_STATUS_CHANGE,
} from "./policy";

function buildContext(
  overrides: Partial<DeliveryContext> = {},
): DeliveryContext {
  const base: DeliveryContext = {
    notification: {
      _id: "n1",
      type: "thread_update",
      title: "Update",
      body: "Body",
      recipientId: "agent-a",
      accountId: "acc1",
    },
    agent: { _id: "agent-a", role: "Developer", name: "Engineer" },
    task: {
      _id: "task1",
      status: "in_progress",
      title: "Task",
      assignedAgentIds: ["agent-a"],
    },
    message: {
      _id: "m1",
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
        _id: "m1",
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
      orchestratorAgentId: "orch",
      agent: { _id: "orch", role: "Squad Lead", name: "Orchestrator" },
      task: {
        _id: "t1",
        status: "in_progress",
        title: "T",
        assignedAgentIds: ["engineer"],
      },
      message: {
        _id: "m1",
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
        _id: "t1",
        status: "done",
        title: "T",
        assignedAgentIds: ["agent-a"],
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
        _id: "t1",
        status: "in_progress",
        title: "T",
        assignedAgentIds: ["agent-a"],
        labels: ["system:orchestrator-chat"],
      },
      notification: {
        ...buildContext().notification!,
        type: "thread_update",
        recipientType: "agent",
        recipientId: "orch",
      },
      orchestratorAgentId: "orch",
      agent: { _id: "orch", role: "Squad Lead", name: "Orchestrator" },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
    const ctxOther = buildContext({
      ...ctx,
      notification: { ...ctx.notification, recipientId: "agent-a" },
      agent: { _id: "agent-a", role: "Developer", name: "Engineer" },
    });
    expect(shouldDeliverToAgent(ctxOther)).toBe(false);
  });
});

describe("isOrchestratorChatTask", () => {
  it("returns true when task has system:orchestrator-chat label", () => {
    expect(
      isOrchestratorChatTask({
        _id: "t1",
        status: "in_progress",
        title: "T",
        labels: ["system:orchestrator-chat"],
      }),
    ).toBe(true);
  });
  it("returns false when label is missing", () => {
    expect(
      isOrchestratorChatTask({
        _id: "t1",
        status: "in_progress",
        title: "T",
      }),
    ).toBe(false);
  });
});

describe("isReviewerRole", () => {
  it("returns true for Squad Lead and QA", () => {
    expect(isReviewerRole("Squad Lead")).toBe(true);
    expect(isReviewerRole("QA")).toBe(true);
    expect(isReviewerRole("review")).toBe(true);
  });
  it("returns false for Developer", () => {
    expect(isReviewerRole("Developer")).toBe(false);
  });
});

describe("isQaAgentProfile", () => {
  it("returns true when slug is qa", () => {
    expect(isQaAgentProfile({ slug: "qa", role: "Developer" })).toBe(true);
  });
  it("returns true when role contains QA", () => {
    expect(isQaAgentProfile({ role: "Quality Assurance" })).toBe(true);
  });
  it("returns false for other roles", () => {
    expect(isQaAgentProfile({ role: "Developer", slug: "engineer" })).toBe(
      false,
    );
  });
});

describe("canAgentMarkDone", () => {
  it("returns false when task is not in review", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "in_progress",
        isOrchestrator: true,
        hasQaAgent: false,
      }),
    ).toBe(false);
  });
  it("returns true for orchestrator when no QA and status is review", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "review",
        isOrchestrator: true,
        hasQaAgent: false,
      }),
    ).toBe(true);
  });
  it("returns true for QA agent when hasQaAgent and role is QA", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "review",
        agentRole: "QA",
        agentSlug: "qa",
        isOrchestrator: false,
        hasQaAgent: true,
      }),
    ).toBe(true);
  });
});
