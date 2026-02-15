/**
 * Unit tests for delivery logic: shouldDeliverToAgent (reply-loop skip, orchestrator/assigned delivery)
 * and formatNotificationMessage (identity line, capabilities).
 */
import { describe, it, expect } from "vitest";
import {
  _getNoResponseRetryDecision,
  _isNoReplySignal,
  _resetNoResponseRetryState,
  _shouldPersistOrchestratorThreadAck,
  _shouldPersistNoResponseFallback,
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
    globalBriefingDoc: null,
    taskOverview: null,
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

  it("returns false for status_change to agent when task is review and agent is not reviewer", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "status_change",
        title: "Status changed",
        body: "Task review",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: "acc1",
      },
      agent: { _id: "agent-a", role: "Writer", name: "Writer" },
      task: {
        _id: "t1",
        status: "review",
        title: "T",
        assignedAgentIds: ["agent-a"],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns true for status_change to agent when task is review and agent is reviewer", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "status_change",
        title: "Status changed",
        body: "Task review",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: "acc1",
      },
      agent: { _id: "agent-a", role: "QA Reviewer", name: "QA" },
      task: {
        _id: "t1",
        status: "review",
        title: "T",
        assignedAgentIds: ["agent-a"],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns true for status_change to agent when task is review and recipient is orchestrator", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "status_change",
        title: "Status changed",
        body: "Task review",
        recipientId: "orch",
        recipientType: "agent",
        accountId: "acc1",
      },
      orchestratorAgentId: "orch",
      agent: { _id: "orch", role: "Engineer", name: "Orchestrator" },
      task: {
        _id: "t1",
        status: "review",
        title: "T",
        assignedAgentIds: ["orch"],
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

  it("returns false for thread_update + user author when task is done", () => {
    const ctx = buildContext({
      message: {
        _id: "m1",
        authorType: "user",
        authorId: "user-1",
        content: "FYI",
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

  it("returns false for thread_update + agent author when sourceNotificationType is thread_update (non-orchestrator)", () => {
    const ctx = buildContext({ sourceNotificationType: "thread_update" });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns true for thread_update + agent author when recipient is orchestrator even if sourceNotificationType is thread_update", () => {
    const ctx = buildContext({
      sourceNotificationType: "thread_update",
      notification: {
        _id: "n1",
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        accountId: "acc1",
      },
      orchestratorAgentId: "orch",
      agent: { _id: "orch", role: "Squad Lead", name: "Squad Lead" },
      message: {
        _id: "m1",
        authorType: "agent",
        authorId: "writer",
        content: "Done",
      },
      task: {
        _id: "t1",
        status: "in_progress",
        title: "T",
        assignedAgentIds: [],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns false for thread_update + agent author when recipient is orchestrator and author is orchestrator", () => {
    const ctx = buildContext({
      sourceNotificationType: "thread_update",
      notification: {
        _id: "n1",
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        accountId: "acc1",
      },
      orchestratorAgentId: "orch",
      agent: { _id: "orch", role: "Squad Lead", name: "Squad Lead" },
      message: {
        _id: "m1",
        authorType: "agent",
        authorId: "orch",
        content: "Done",
      },
      task: {
        _id: "t1",
        status: "in_progress",
        title: "T",
        assignedAgentIds: [],
      },
    });
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

  it("includes global context and task overview when provided", () => {
    const ctx = buildContext({
      globalBriefingDoc: {
        title: "Account Briefing",
        content: "Briefing content.",
      },
      taskOverview: {
        totals: [
          { status: "inbox", count: 1 },
          { status: "in_progress", count: 2 },
        ],
        topTasks: [
          {
            status: "inbox",
            tasks: [
              {
                taskId: "task-1",
                title: "Sample task",
                status: "inbox",
                priority: 3,
                assignedAgentIds: [],
                assignedUserIds: [],
              },
            ],
          },
          {
            status: "done",
            tasks: [
              {
                taskId: "task-2",
                title: "Completed task",
                status: "done",
                priority: 2,
                assignedAgentIds: [],
                assignedUserIds: [],
              },
            ],
          },
        ],
      },
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
    expect(message).toContain("Global Context:");
    expect(message).toContain("Briefing content.");
    expect(message).toContain("Task overview (compact):");
    expect(message).toContain("Sample task");
  });

  it("truncates thread history and long messages", () => {
    const longContent = "x".repeat(1601);
    const thread = Array.from({ length: 30 }, (_, index) => ({
      messageId: `m${index}`,
      authorType: "user",
      authorId: `user-${index}`,
      authorName: null,
      content: index === 29 ? longContent : `msg-${index}`,
      createdAt: 1700000000000 + index,
    }));
    const ctx = buildContext({ thread });
    const toolCapabilities = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: false,
      canCreateDocuments: false,
      hasTaskContext: true,
    });
    const message = formatNotificationMessage(
      ctx,
      "http://runtime:3000",
      toolCapabilities,
    );
    const expectedTruncated = `${longContent.slice(0, 1499)}…`;
    expect(message).toContain("Thread history (recent):");
    expect(message).toContain("(... 5 older messages omitted)");
    expect(message).toContain("msg-5");
    expect(message).not.toContain("msg-0");
    expect(message).toContain(expectedTruncated);
  });

  it("includes one-branch-per-task rule and task worktree path when task is present", () => {
    const ctx = buildContext({
      task: {
        _id: "k97abc",
        status: "in_progress",
        title: "Sample",
        assignedAgentIds: ["agent-a"],
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
    expect(message).toContain("feat/task-k97abc");
    expect(message).toContain("only branch");
    expect(message).toContain("/root/clawd/worktrees/feat-task-k97abc");
    expect(message).toContain("worktree");
    expect(message).toContain("git worktree add");
    expect(message).toContain("git checkout dev");
  });

  it("omits task-branch and worktree rule when task is not present", () => {
    const ctx = buildContext({ task: null });
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
    expect(message).not.toContain("feat/task-");
    expect(message).not.toContain("/root/clawd/worktrees/feat-task-");
  });

  it("includes workflow rules: human dependency -> blocked and move back to in_progress when resolved", () => {
    const ctx = buildContext({
      task: {
        _id: "t1",
        status: "in_progress",
        title: "T",
        assignedAgentIds: ["agent-a"],
      },
      effectiveBehaviorFlags: { canModifyTaskStatus: true },
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
    expect(message).toContain("human input");
    expect(message).toContain("blocked");
    expect(message).toContain("blockedReason");
    expect(message).toContain("move the task back to in_progress");
    expect(message).toContain("blocked -> in_progress");
  });

  it("includes orchestrator rule: move to review before requesting QA and use response_request", () => {
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
      agent: { _id: "orch", role: "Squad Lead", name: "Orchestrator" },
      task: {
        _id: "t1",
        status: "in_progress",
        title: "T",
        assignedAgentIds: ["engineer"],
      },
      mentionableAgents: [
        {
          id: "orch",
          slug: "squad-lead",
          name: "Orchestrator",
          role: "Squad Lead",
        },
      ],
      effectiveBehaviorFlags: {
        canModifyTaskStatus: true,
        canMentionAgents: true,
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
    expect(message).toContain("task MUST be in REVIEW");
    expect(message).toContain("Move the task to review first");
    expect(message).toContain("response_request");
    expect(message).toContain(
      "Do not request QA approval while the task is still in_progress",
    );
  });

  it("includes blocked-task reminder to move back to in_progress when resolved", () => {
    const ctx = buildContext({
      task: {
        _id: "t1",
        status: "blocked",
        title: "T",
        assignedAgentIds: ["agent-a"],
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
    expect(message).toContain("BLOCKED");
    expect(message).toContain("move the task back to in_progress");
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

describe("no reply signal detection", () => {
  it("detects legacy no-reply sentinel values", () => {
    expect(_isNoReplySignal("NO_REPLY")).toBe(true);
    expect(_isNoReplySignal("NO")).toBe(true);
    expect(_isNoReplySignal("NO_")).toBe(true);
  });

  it("does not treat HEARTBEAT_OK as a no-reply signal", () => {
    expect(_isNoReplySignal("HEARTBEAT_OK")).toBe(false);
  });
});

describe("no response fallback persistence policy", () => {
  it("does not persist fallback to thread for any type (UX: no boilerplate in thread)", () => {
    expect(
      _shouldPersistNoResponseFallback({ notificationType: "assignment" }),
    ).toBe(false);
    expect(
      _shouldPersistNoResponseFallback({ notificationType: "mention" }),
    ).toBe(false);
    expect(
      _shouldPersistNoResponseFallback({
        notificationType: "response_request",
      }),
    ).toBe(false);
    expect(
      _shouldPersistNoResponseFallback({ notificationType: "thread_update" }),
    ).toBe(false);
    expect(
      _shouldPersistNoResponseFallback({ notificationType: "status_change" }),
    ).toBe(false);
  });
});

describe("orchestrator no-reply acknowledgment policy", () => {
  it("does not persist orchestrator ack (silent-by-default)", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        recipientType: "agent",
        accountId: "acc1",
      },
      orchestratorAgentId: "orch",
      agent: { _id: "orch", role: "Squad Lead", name: "Squad Lead" },
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
        content: "Progress update",
      },
    });
    expect(_shouldPersistOrchestratorThreadAck(ctx)).toBe(false);
  });

  it("does not persist orchestrator ack for blocked tasks", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        recipientType: "agent",
        accountId: "acc1",
      },
      orchestratorAgentId: "orch",
      agent: { _id: "orch", role: "Squad Lead", name: "Squad Lead" },
      task: {
        _id: "t1",
        status: "blocked",
        title: "T",
        assignedAgentIds: ["engineer"],
      },
      message: {
        _id: "m1",
        authorType: "agent",
        authorId: "engineer",
        content: "Still blocked",
      },
    });
    expect(_shouldPersistOrchestratorThreadAck(ctx)).toBe(false);
  });

  it("does not persist orchestrator ack when recipient is not orchestrator", () => {
    const ctx = buildContext({
      notification: {
        _id: "n1",
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "engineer",
        recipientType: "agent",
        accountId: "acc1",
      },
      orchestratorAgentId: "orch",
      agent: { _id: "engineer", role: "Engineer", name: "Engineer" },
      task: {
        _id: "t1",
        status: "review",
        title: "T",
        assignedAgentIds: ["engineer"],
      },
      message: {
        _id: "m1",
        authorType: "agent",
        authorId: "qa",
        content: "QA update",
      },
    });
    expect(_shouldPersistOrchestratorThreadAck(ctx)).toBe(false);
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
