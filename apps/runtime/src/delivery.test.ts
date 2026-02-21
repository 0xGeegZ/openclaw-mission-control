/**
 * Unit tests for delivery logic: shouldDeliverToAgent (reply-loop skip, orchestrator/assigned delivery)
 * and formatNotificationMessage (identity line, capabilities).
 */
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { beforeEach, describe, it, expect } from "vitest";
import {
  _getNoResponseRetryDecision,
  _isNoReplySignal,
  _isStaleThreadUpdateNotification,
  _resetNoResponseRetryState,
  canAgentMarkDone,
  getDeliveryState,
  shouldDeliverToAgent,
  stopDeliveryLoop,
  formatNotificationMessage,
  buildDeliveryInstructions,
  buildNotificationInput,
} from "./delivery";
import {
  shouldPersistNoResponseFallback,
  shouldPersistOrchestratorThreadAck,
} from "./delivery/policy";
import type { DeliveryContext } from "@packages/backend/convex/service/notifications";
import { getToolCapabilitiesAndSchemas } from "./tooling/agentTools";
import {
  accId,
  aid,
  buildContext,
  mid,
  nid,
  tid,
} from "./test-helpers/deliveryContext";

describe("shouldDeliverToAgent", () => {
  it("returns false for status_change to agent when task is done", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "status_change",
        title: "Status changed",
        body: "Task done",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: accId("acc1"),
      },
      task: {
        _id: tid("t1"),
        status: "done",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns false for status_change to agent when task is blocked", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "status_change",
        title: "Status changed",
        body: "Task blocked",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: accId("acc1"),
      },
      task: {
        _id: tid("t1"),
        status: "blocked",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns true for status_change to agent when task is in_progress", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "status_change",
        title: "Status changed",
        body: "Task in progress",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: accId("acc1"),
      },
      task: {
        _id: tid("t1"),
        status: "in_progress",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns false for status_change to agent when task is review and agent is not reviewer", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "status_change",
        title: "Status changed",
        body: "Task review",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: accId("acc1"),
      },
      agent: { _id: aid("agent-a"), role: "Writer", name: "Writer" },
      task: {
        _id: tid("t1"),
        status: "review",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns true for status_change to agent when task is review and agent has canReviewTasks", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "status_change",
        title: "Status changed",
        body: "Task review",
        recipientId: "agent-a",
        recipientType: "agent",
        accountId: accId("acc1"),
      },
      agent: { _id: aid("agent-a"), role: "QA Reviewer", name: "QA" },
      task: {
        _id: tid("t1"),
        status: "review",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
      },
      effectiveBehaviorFlags: { canReviewTasks: true },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns true for status_change to agent when task is review and recipient is orchestrator", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "status_change",
        title: "Status changed",
        body: "Task review",
        recipientId: "orch",
        recipientType: "agent",
        accountId: accId("acc1"),
      },
      orchestratorAgentId: aid("orch"),
      agent: { _id: aid("orch"), role: "Engineer", name: "Orchestrator" },
      task: {
        _id: tid("t1"),
        status: "review",
        title: "T",
        assignedAgentIds: [aid("orch")],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(true);
  });

  it("returns false for thread_update + agent author when task is done", () => {
    const ctx = buildContext({
      task: {
        _id: tid("t1"),
        status: "done",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns false for thread_update + user author when task is done", () => {
    const ctx = buildContext({
      message: {
        _id: mid("m1"),
        authorType: "user",
        authorId: "user-1",
        content: "FYI",
      },
      task: {
        _id: tid("t1"),
        status: "done",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
      },
    });
    expect(shouldDeliverToAgent(ctx)).toBe(false);
  });

  it("returns false for thread_update + agent author when task is blocked", () => {
    const ctx = buildContext({
      task: {
        _id: tid("t1"),
        status: "blocked",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
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
        _id: nid("n1"),
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        accountId: accId("acc1"),
      },
      orchestratorAgentId: aid("orch"),
      agent: { _id: aid("orch"), role: "Squad Lead", name: "Squad Lead" },
      message: {
        _id: mid("m1"),
        authorType: "agent",
        authorId: "writer",
        content: "Done",
      },
      task: {
        _id: tid("t1"),
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
        _id: nid("n1"),
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        accountId: accId("acc1"),
      },
      orchestratorAgentId: aid("orch"),
      agent: { _id: aid("orch"), role: "Squad Lead", name: "Squad Lead" },
      message: {
        _id: mid("m1"),
        authorType: "agent",
        authorId: "orch",
        content: "Done",
      },
      task: {
        _id: tid("t1"),
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
        _id: nid("n1"),
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        accountId: accId("acc1"),
      },
      orchestratorAgentId: aid("orch"),
      task: {
        _id: tid("t1"),
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
      task: {
        _id: tid("t1"),
        status: "done",
        title: "T",
        assignedAgentIds: [],
      },
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

describe("buildDeliveryInstructions", () => {
  it("includes strict current-task-only scope constraints", () => {
    const ctx = buildContext({
      task: {
        _id: tid("task1"),
        status: "in_progress",
        title: "My Task",
        assignedAgentIds: [aid("agent-a")],
      },
    });
    const toolCapabilities = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: false,
      hasTaskContext: true,
    });
    const instructions = buildDeliveryInstructions(
      ctx,
      "http://runtime:3000",
      toolCapabilities,
    );
    expect(instructions).toContain("Respond only to this notification.");
    expect(instructions).toContain(
      "Use only the thread history shown above for this task",
    );
  });

  it("throws when deliverySessionKey is missing", () => {
    const ctx = buildContext({
      deliverySessionKey: undefined,
    });
    const toolCapabilities = getToolCapabilitiesAndSchemas({
      canCreateTasks: false,
      canModifyTaskStatus: true,
      canCreateDocuments: false,
      hasTaskContext: true,
    });
    expect(() =>
      buildDeliveryInstructions(ctx, "http://runtime:3000", toolCapabilities),
    ).toThrow("Missing deliverySessionKey");
  });
});

describe("buildNotificationInput", () => {
  it("includes notification id anchor", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("notif-123"),
        type: "thread_update",
        title: "Update",
        body: "Body",
        accountId: accId("acc1"),
      },
    });
    const input = buildNotificationInput(ctx);
    expect(input).toContain("Notification ID: notif-123");
  });
});

describe("formatNotificationMessage", () => {
  it("includes identity line with agent name and role when present", () => {
    const ctx = buildContext({
      agent: { _id: aid("agent-a"), role: "Squad Lead", name: "Orchestrator" },
      notification: {
        _id: nid("n1"),
        type: "assignment",
        title: "New task",
        body: "Body",
        accountId: accId("acc1"),
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
      agent: { _id: aid("agent-a") },
      deliverySessionKey: "system:agent:x:acc1:v1",
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
                taskId: tid("task-1"),
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
                taskId: tid("task-2"),
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
      messageId: mid(`m${index}`),
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

  it("includes repository guidance when task is present and repository doc is missing", () => {
    const ctx = buildContext({
      task: {
        _id: tid("k97abc"),
        status: "in_progress",
        title: "Sample",
        assignedAgentIds: [aid("agent-a")],
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
    expect(message).toContain("Repository context:");
    expect(message).toContain("Ask the orchestrator or account owner");
  });

  it("shows repository not found when no repository doc", () => {
    const ctx = buildContext({ task: null, repositoryDoc: null });
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
    expect(message).toContain("Repository context: not found");
    expect(message).toContain("add a Repository document");
  });

  it("includes concise workflow rules for blocked and resume transitions", () => {
    const ctx = buildContext({
      task: {
        _id: tid("t1"),
        status: "in_progress",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
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
    expect(message).toContain(
      "When waiting on human input/approval, move task to blocked",
    );
    expect(message).toContain("move back to in_progress once unblocked");
    expect(message).toContain("blocked -> in_progress");
  });

  it("includes concise orchestrator rule for review and response_request", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        accountId: accId("acc1"),
      },
      orchestratorAgentId: aid("orch"),
      agent: { _id: aid("orch"), role: "Squad Lead", name: "Orchestrator" },
      task: {
        _id: tid("t1"),
        status: "in_progress",
        title: "T",
        assignedAgentIds: [aid("engineer")],
      },
      mentionableAgents: [
        {
          id: aid("orch"),
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
    expect(message).toContain("move task to REVIEW");
    expect(message).toContain("response_request");
    expect(message).toContain("Do not rely on thread mentions alone");
  });

  it("includes blocked-task reminder to move back to in_progress when resolved", () => {
    const ctx = buildContext({
      task: {
        _id: tid("t1"),
        status: "blocked",
        title: "T",
        assignedAgentIds: [aid("agent-a")],
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

  it("includes multi-assignee collaboration instructions when task has two or more assignees and recipient is assigned", () => {
    const ctx = buildContext({
      task: {
        _id: tid("t1"),
        status: "in_progress",
        title: "Shared task",
        assignedAgentIds: [aid("agent-a"), aid("agent-b")],
      },
      agent: { _id: aid("agent-a"), role: "Engineer", name: "Engineer" },
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
    expect(message).toContain("thread-first collaboration required");
    expect(message).toContain("ask a direct question in the thread");
    expect(message).toContain("Do not treat silence as agreement");
    expect(message).toContain("agreement summary");
    expect(message).toContain("response_request");
  });

  it("omits multi-assignee block when task has only one agent assignee", () => {
    const ctx = buildContext({
      task: {
        _id: tid("t1"),
        status: "in_progress",
        title: "Solo task",
        assignedAgentIds: [aid("agent-a")],
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
    expect(message).not.toContain("**Multi-assignee:**");
  });

  it("omits multi-assignee block when task has multiple assignees but recipient is not one of them", () => {
    const ctx = buildContext({
      task: {
        _id: tid("t1"),
        status: "in_progress",
        title: "Shared task",
        assignedAgentIds: [aid("agent-a"), aid("agent-b")],
      },
      agent: { _id: aid("agent-c"), role: "Orchestrator", name: "Orch" },
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
    expect(message).not.toContain("**Multi-assignee:**");
  });
});

describe("no response retry decision", () => {
  it("retries until the limit is reached", () => {
    _resetNoResponseRetryState();
    const first = _getNoResponseRetryDecision("n1");
    const second = _getNoResponseRetryDecision("n1");
    const third = _getNoResponseRetryDecision("n1");
    expect(first.attempt).toBe(1);
    expect(first.shouldRetry).toBe(true);
    expect(second.attempt).toBe(2);
    expect(second.shouldRetry).toBe(true);
    expect(third.attempt).toBe(3);
    expect(third.shouldRetry).toBe(false);
  });

  it("resets attempt after NO_RESPONSE_RETRY_RESET_MS (10 min) so shouldRetry is true again", () => {
    const RESET_MS = 10 * 60 * 1000;
    _resetNoResponseRetryState();
    const t0 = 1000;
    _getNoResponseRetryDecision("n1", t0);
    _getNoResponseRetryDecision("n1", t0 + 1);
    const third = _getNoResponseRetryDecision("n1", t0 + 2);
    expect(third.shouldRetry).toBe(false);
    const afterReset = _getNoResponseRetryDecision("n1", t0 + 2 + RESET_MS + 1);
    expect(afterReset.attempt).toBe(1);
    expect(afterReset.shouldRetry).toBe(true);
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

describe("policy re-exports (fallback/orchestrator ack)", () => {
  it("shouldPersistNoResponseFallback is false (policy: no fallback to thread)", () => {
    expect(
      shouldPersistNoResponseFallback({ notificationType: "assignment" }),
    ).toBe(false);
  });
  it("shouldPersistOrchestratorThreadAck is false (policy: silent-by-default)", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientId: "orch",
        recipientType: "agent",
        accountId: accId("acc1"),
      },
      orchestratorAgentId: aid("orch"),
      agent: { _id: aid("orch"), role: "Squad Lead", name: "Squad Lead" },
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
        content: "Progress update",
      },
    });
    expect(shouldPersistOrchestratorThreadAck(ctx)).toBe(false);
  });
});

describe("_isStaleThreadUpdateNotification", () => {
  it("returns true when thread_update has messageId and a user message exists after it in thread", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "thread_update",
        title: "Update",
        body: "Body",
        recipientType: "agent",
        messageId: mid("m0"),
        accountId: accId("acc1"),
      },
      message: { _id: mid("m0"), authorType: "user", authorId: "user-1" },
      thread: [
        {
          messageId: mid("m0"),
          authorType: "user",
          authorId: "user-1",
          authorName: null,
          content: "Hi",
          createdAt: 1000,
        },
        {
          messageId: mid("m1"),
          authorType: "agent",
          authorId: "agent-a",
          authorName: null,
          content: "Ok",
          createdAt: 2000,
        },
        {
          messageId: mid("m2"),
          authorType: "user",
          authorId: "user-1",
          authorName: null,
          content: "Thanks",
          createdAt: 3000,
        },
      ],
    });
    expect(_isStaleThreadUpdateNotification(ctx)).toBe(true);
  });

  it("returns false when no messageId", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "thread_update",
        title: "T",
        body: "B",
        recipientType: "agent",
        accountId: accId("acc1"),
      },
      message: { _id: mid("m1"), authorType: "user", authorId: "user-1" },
      thread: [
        {
          messageId: mid("m1"),
          authorType: "user",
          authorId: "user-1",
          authorName: null,
          content: "Hi",
          createdAt: 1000,
        },
      ],
    });
    expect(ctx.notification.messageId).toBeUndefined();
    expect(_isStaleThreadUpdateNotification(ctx)).toBe(false);
  });

  it("returns false when no user message after the notified message", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "thread_update",
        title: "T",
        body: "B",
        recipientType: "agent",
        messageId: mid("m0"),
        accountId: accId("acc1"),
      },
      message: { _id: mid("m0"), authorType: "user", authorId: "user-1" },
      thread: [
        {
          messageId: mid("m0"),
          authorType: "user",
          authorId: "user-1",
          authorName: null,
          content: "Hi",
          createdAt: 1000,
        },
        {
          messageId: mid("m1"),
          authorType: "agent",
          authorId: "agent-a",
          authorName: null,
          content: "Reply",
          createdAt: 2000,
        },
      ],
    });
    expect(_isStaleThreadUpdateNotification(ctx)).toBe(false);
  });

  it("returns false when not thread_update", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "assignment",
        title: "T",
        body: "B",
        accountId: accId("acc1"),
      },
      thread: [],
    });
    expect(_isStaleThreadUpdateNotification(ctx)).toBe(false);
  });

  it("returns false when recipientType is not agent", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "thread_update",
        title: "T",
        body: "B",
        recipientType: "user",
        messageId: mid("m0"),
        accountId: accId("acc1"),
      },
      message: { _id: mid("m0"), authorType: "user", authorId: "user-1" },
      thread: [
        {
          messageId: mid("m0"),
          authorType: "user",
          authorId: "user-1",
          authorName: null,
          content: "Hi",
          createdAt: 1000,
        },
      ],
    });
    expect(_isStaleThreadUpdateNotification(ctx)).toBe(false);
  });

  it("returns false when message author is not user", () => {
    const ctx = buildContext({
      notification: {
        _id: nid("n1"),
        type: "thread_update",
        title: "T",
        body: "B",
        recipientType: "agent",
        messageId: mid("m0"),
        accountId: accId("acc1"),
      },
      message: { _id: mid("m0"), authorType: "agent", authorId: "agent-b" },
      thread: [
        {
          messageId: mid("m0"),
          authorType: "agent",
          authorId: "agent-b",
          authorName: null,
          content: "Done",
          createdAt: 1000,
        },
        {
          messageId: mid("m1"),
          authorType: "user",
          authorId: "user-1",
          authorName: null,
          content: "Ok",
          createdAt: 2000,
        },
      ],
    });
    expect(_isStaleThreadUpdateNotification(ctx)).toBe(false);
  });
});

describe("getDeliveryState", () => {
  it("returns shape with isRunning, deliveredCount, noResponseFailures, and other fields", () => {
    const s = getDeliveryState();
    expect(s).toHaveProperty("isRunning");
    expect(s).toHaveProperty("lastDelivery");
    expect(s).toHaveProperty("deliveredCount");
    expect(s).toHaveProperty("failedCount");
    expect(s).toHaveProperty("consecutiveFailures");
    expect(s).toHaveProperty("lastErrorAt");
    expect(s).toHaveProperty("lastErrorMessage");
    expect(s).toHaveProperty("noResponseFailures");
    expect(s).toHaveProperty("noResponseTerminalSkipCount");
    expect(s).toHaveProperty("requiredNotificationRetryExhaustedCount");
    expect(s.noResponseFailures).toBeInstanceOf(Map);
  });

  it("returns a snapshot: mutating returned noResponseFailures does not affect next getDeliveryState", () => {
    _resetNoResponseRetryState();
    const first = getDeliveryState();
    first.noResponseFailures.set("x", { count: 1, lastAt: 1 });
    const second = getDeliveryState();
    expect(second.noResponseFailures.has("x")).toBe(false);
  });
});

describe("startDeliveryLoop / stopDeliveryLoop", () => {
  beforeEach(() => {
    stopDeliveryLoop();
  });

  it("stopDeliveryLoop is idempotent and sets isRunning false", () => {
    stopDeliveryLoop();
    stopDeliveryLoop();
    expect(getDeliveryState().isRunning).toBe(false);
  });
});

describe("canAgentMarkDone", () => {
  it("returns true when task is review and canMarkDone is true", () => {
    expect(canAgentMarkDone({ taskStatus: "review", canMarkDone: true })).toBe(
      true,
    );
  });

  it("returns false when canMarkDone is false even if task is review", () => {
    expect(canAgentMarkDone({ taskStatus: "review", canMarkDone: false })).toBe(
      false,
    );
  });

  it("returns false when task is not in review", () => {
    expect(
      canAgentMarkDone({
        taskStatus: "in_progress",
        canMarkDone: true,
      }),
    ).toBe(false);
  });
});
