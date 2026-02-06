/**
 * Unit tests for delivery logic: shouldDeliverToAgent (reply-loop skip, orchestrator/assigned delivery)
 * and formatNotificationMessage (identity line, capabilities).
 */
import { describe, it, expect } from "vitest";
import {
  _getNoResponseRetryDecision,
  _resetNoResponseRetryState,
  canAgentMarkDone,
  shouldDeliverToAgent,
  formatNotificationMessage,
  type DeliveryContext,
} from "./delivery";
import { getToolCapabilitiesAndSchemas } from "./tooling/agentTools";

/** Build a minimal DeliveryContext for tests. */
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
  };
  return { ...base, ...overrides } as DeliveryContext;
}

describe("shouldDeliverToAgent", () => {
  it("returns false for status_change to agent when task is done", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "status_change",
        title: "Status changed",
        body: "Task done",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: "acc1",
      },
      task: {
        _id: "t1",
        status: "done",
        title: "T",
        assignedAgentIds: ["agent-a"],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns false for status_change to agent when task is blocked", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "status_change",
        title: "Status changed",
        body: "Task blocked",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: "acc1",
      },
      task: {
        _id: "t1",
        status: "blocked",
        title: "T",
        assignedAgentIds: ["agent-a"],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns true for status_change to agent when task is in_progress", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "status_change",
        title: "Status changed",
        body: "Task in progress",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: "acc1",
      },
      task: {
        _id: "t1",
        status: "in_progress",
        title: "T",
        assignedAgentIds: ["agent-a"],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns false for thread_update + agent author when task is done", () => {
    const ctx = buildContext({
      task: {
        _id: "t1",
        status: "done",
        title: "T",
        assignedAgentIds: ["agent-a"],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns false for thread_update + agent author when task is blocked", () => {
    const ctx = buildContext({
      task: {
        _id: "t1",
        status: "blocked",
        title: "T",
        assignedAgentIds: ["agent-a"],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns false for thread_update + agent author when sourceNotificationType is thread_update", () => {
    const ctx = buildContext({ sourceNotificationType: "thread_update" });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns true for thread_update + agent author when recipient is assigned", () => {
    const ctx = buildContext();
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns true for thread_update + agent author when recipient is orchestrator", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        accountId: "acc1",
      },
      orchestratorAgentId: "orch",
      task: {
        _id: "t1",
        status: "in_progress",
        title: "T",
        assignedAgentIds: [],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns true for mention when task is done (user can still @mention agents)", () => {
    const ctx = buildContext({
      notification: { ...buildContext().notification, type: "mention" },
      task: { _id: "t1", status: "done", title: "T", assignedAgentIds: [] },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns true for assignment notification", () => {
    const ctx = buildContext({
      notification: { ...buildContext().notification, type: "assignment" },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });
});

describe("formatNotificationMessage", () => {
  it("includes identity line with agent name and role when present", () => {
    const ctx = buildContext({
      agent: { _id: "agent-a", role: "Squad Lead", name: "Orchestrator" },
      notification: {
        _id: "n1",
        type: "assignment",
        title: "New task",
        body: "Body",
        accountId: "acc1",
      },
    });
    const toolCapabilities = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: false,
      hasTaskContext: true,
    });
    const message = formatNotificationMessage(
      ctx,
      "http://runtime:3000",
      toolCapabilities,
    );
    expect(message).toContain(
      "You are replying as: **Orchestrator** (Squad Lead).",
    );
    expect(message).toContain(
      "Reply only as this agent; do not speak as or ask whether you are another role.",
    );
  });

  it("uses fallbacks when agent name or role is missing", () => {
    const ctx = buildContext({
      agent: { _id: "agent-a", sessionKey: "agent:x:acc1" },
    });
    const toolCapabilities = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: false,
    });
    const message = formatNotificationMessage(
      ctx,
      "http://runtime:3000",
      toolCapabilities,
    );
    expect(message).toContain("You are replying as: **Agent** (Unknown role).");
  });
});

describe("no response retry decision", () => {
  it("retries until the limit is reached", () => {
    _resetNoResponseRetryState();
    const first = _getNoResponseRetryDecision("n1");
    const second = _getNoResponseRetryDecision("n1");
    const third = _getNoResponseRetryDecision("n1");
    expect(first.shouldRetry).toBe(true);
    expect(second.shouldRetry).toBe(true);
    expect(third.shouldRetry).toBe(false);
  });
});

describe("canAgentMarkDone", () => {
  it("allows QA to mark done when QA exists and task is in review", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "review",
        agentRole: "QA / Reviewer",
        agentSlug: "engineer",
        isOrchestrator: false,
        hasQaAgent: true,
      }),
    ).toBe(true);
  });

  it("allows slug-based QA when role is not QA", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "review",
        agentRole: "Developer",
        agentSlug: "qa",
        isOrchestrator: false,
        hasQaAgent: true,
      }),
    ).toBe(true);
  });

  it("blocks non-QA when QA exists", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "review",
        agentRole: "Squad Lead",
        agentSlug: "lead",
        isOrchestrator: true,
        hasQaAgent: true,
      }),
    ).toBe(false);
  });

  it("allows orchestrator when no QA exists", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "review",
        agentRole: "Squad Lead",
        agentSlug: "lead",
        isOrchestrator: true,
        hasQaAgent: false,
      }),
    ).toBe(true);
  });

  it("blocks when task is not in review", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "in_progress",
        agentRole: "QA / Reviewer",
        agentSlug: "qa",
        isOrchestrator: false,
        hasQaAgent: true,
      }),
    ).toBe(false);
  });
});
