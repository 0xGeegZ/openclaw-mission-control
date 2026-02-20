/**
 * Unit tests for the delivery poll cycle (_runOnePollCycle) with mocked Convex and gateway.
 * Isolates vi.mock in this file so delivery.test.ts stays mock-free for policy/prompt tests.
 */
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "./config";
import {
  _resetDeliveryStateForTests,
  _resetNoResponseRetryState,
  _runOnePollCycle,
  getDeliveryState,
} from "./delivery";
import type { DeliveryContext } from "@packages/backend/convex/service/notifications";
import {
  accId,
  aid,
  buildContext,
  mid,
  nid,
  tid,
} from "./test-helpers/deliveryContext";

const mockGetConvexClient = vi.hoisted(() => vi.fn());
const mockAction = vi.hoisted(() => vi.fn());
const mockSendToOpenClaw = vi.hoisted(() => vi.fn());
const mockSendOpenClawToolResults = vi.hoisted(() => vi.fn());
const mockRegisterSession = vi.hoisted(() => vi.fn());
const mockRecordSuccess = vi.hoisted(() => vi.fn());
const mockRecordFailure = vi.hoisted(() => vi.fn());
const mockBackoffMs = vi.hoisted(() => vi.fn());

vi.mock("./convex-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./convex-client")>();
  return { ...mod, getConvexClient: mockGetConvexClient };
});

vi.mock("./gateway", () => ({
  sendToOpenClaw: mockSendToOpenClaw,
  sendOpenClawToolResults: mockSendOpenClawToolResults,
  registerSession: mockRegisterSession,
}));

vi.mock("./metrics", () => ({
  recordSuccess: mockRecordSuccess,
  recordFailure: mockRecordFailure,
}));

vi.mock("./backoff", () => ({
  backoffMs: mockBackoffMs,
}));

const DEFAULT_INTERVAL = 5000;
const DEFAULT_BACKOFF_MS = 1000;

function createConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    accountId: accId("acc-test"),
    convexUrl: "https://example.convex.cloud",
    serviceToken: "test-token",
    healthPort: 3000,
    healthHost: "127.0.0.1",
    deliveryInterval: DEFAULT_INTERVAL,
    healthCheckInterval: 10000,
    agentSyncInterval: 60000,
    logLevel: "info",
    deliveryBackoffBaseMs: 1000,
    deliveryBackoffMaxMs: 60000,
    runtimeServiceVersion: "test",
    openclawVersion: "test",
    dropletId: "",
    dropletIp: "",
    dropletRegion: "",
    openclawGatewayUrl: "http://127.0.0.1:18789",
    openclawGatewayToken: undefined,
    openclawRequestTimeoutMs: 30000,
    deliveryMaxConcurrentSessions: 10,
    deliveryStreamTimeoutMs: 60000,
    deliveryContextFetchBatchSize: 15,
    openclawClientToolsEnabled: true,
    taskStatusBaseUrl: "http://runtime:3000",
    openclawWorkspaceRoot: "/tmp",
    ...overrides,
  } as RuntimeConfig;
}

describe("_runOnePollCycle", () => {
  const config = createConfig();

  beforeEach(() => {
    _resetNoResponseRetryState();
    _resetDeliveryStateForTests();
    vi.clearAllMocks();
    mockGetConvexClient.mockReturnValue({ action: mockAction });
    mockSendToOpenClaw.mockResolvedValue({ text: "OK", toolCalls: [] });
    mockSendOpenClawToolResults.mockResolvedValue(null);
    mockRegisterSession.mockReturnValue(undefined);
    mockBackoffMs.mockReturnValue(DEFAULT_BACKOFF_MS);
  });

  it("empty poll: returns deliveryInterval and does not call getNotificationForDelivery or sendToOpenClaw", async () => {
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50 && "accountId" in a) {
          return [];
        }
        return undefined;
      },
    );

    const delay = await _runOnePollCycle(config);

    expect(delay).toBe(DEFAULT_INTERVAL);
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: config.accountId,
        serviceToken: config.serviceToken,
        limit: 50,
      }),
    );
    const actionCalls = mockAction.mock.calls;
    const getForDeliveryCalls = actionCalls.filter(
      (c) => (c[1] as Record<string, unknown>)?.notificationId != null,
    );
    expect(getForDeliveryCalls).toHaveLength(0);
    expect(mockSendToOpenClaw).not.toHaveBeenCalled();
    expect(getDeliveryState().lastDelivery).not.toBeNull();
  });

  it("skip missing task: marks delivered and does not call sendToOpenClaw", async () => {
    const notifId = nid("n-missing-task");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "thread_update",
              title: "T",
              body: "B",
              taskId: tid("t1"),
              accountId: config.accountId,
            },
            task: null,
          });
        }
        return undefined;
      },
    );

    const before = getDeliveryState().deliveredCount;
    const delay = await _runOnePollCycle(config);

    expect(delay).toBe(DEFAULT_INTERVAL);
    expect(getDeliveryState().deliveredCount).toBe(before + 1);
    expect(mockSendToOpenClaw).not.toHaveBeenCalled();
  });

  it("skip shouldDeliverToAgent false: marks delivered and does not call sendToOpenClaw", async () => {
    const notifId = nid("n-skip-policy");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "thread_update",
              title: "T",
              body: "B",
              accountId: config.accountId,
            },
            task: {
              _id: tid("t1"),
              status: "done",
              title: "T",
              assignedAgentIds: [],
            },
          });
        }
        return undefined;
      },
    );

    const before = getDeliveryState().deliveredCount;
    await _runOnePollCycle(config);

    expect(getDeliveryState().deliveredCount).toBe(before + 1);
    expect(mockSendToOpenClaw).not.toHaveBeenCalled();
  });

  it("skip stale thread_update: marks delivered and does not call sendToOpenClaw", async () => {
    const notifId = nid("n-stale");
    const msg0 = mid("m0");
    const msg1 = mid("m1");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "thread_update",
              title: "T",
              body: "B",
              recipientType: "agent",
              messageId: msg0,
              accountId: config.accountId,
            },
            message: {
              _id: msg0,
              authorType: "user",
              authorId: "user-1",
              content: "Hi",
            },
            thread: [
              {
                messageId: msg0,
                authorType: "user",
                authorId: "user-1",
                authorName: "User",
                content: "Hi",
                createdAt: 1000,
              },
              {
                messageId: msg1,
                authorType: "user",
                authorId: "user-1",
                authorName: "User",
                content: "Follow-up",
                createdAt: 2000,
              },
            ],
          });
        }
        return undefined;
      },
    );

    const before = getDeliveryState().deliveredCount;
    await _runOnePollCycle(config);

    expect(getDeliveryState().deliveredCount).toBe(before + 1);
    expect(mockSendToOpenClaw).not.toHaveBeenCalled();
  });

  it("skip missing agent: context with agent null marks delivered and does not call sendToOpenClaw", async () => {
    const notifId = nid("n-no-agent");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "thread_update",
              title: "T",
              body: "B",
              accountId: config.accountId,
            },
            agent: null,
          });
        }
        return undefined;
      },
    );

    const before = getDeliveryState().deliveredCount;
    await _runOnePollCycle(config);

    expect(getDeliveryState().deliveredCount).toBe(before + 1);
    expect(mockSendToOpenClaw).not.toHaveBeenCalled();
  });

  it("context null: no send and no crash; notification is not marked delivered in this poll", async () => {
    const notifId = nid("n-null-ctx");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) return null;
        return undefined;
      },
    );

    const before = getDeliveryState().deliveredCount;
    await _runOnePollCycle(config);

    expect(mockSendToOpenClaw).not.toHaveBeenCalled();
    expect(getDeliveryState().deliveredCount).toBe(before);
  });

  it("skip missing deliverySessionKey: marks delivered and does not call sendToOpenClaw", async () => {
    const notifId = nid("n-no-session");
    const taskId = tid("task-no-session");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "assignment",
              title: "T",
              body: "B",
              taskId,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: taskId,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
            deliverySessionKey: undefined,
          });
        }
        return undefined;
      },
    );

    const beforeFailed = getDeliveryState().failedCount;
    const beforeDelivered = getDeliveryState().deliveredCount;
    await _runOnePollCycle(config);

    expect(mockSendToOpenClaw).not.toHaveBeenCalled();
    expect(getDeliveryState().failedCount).toBe(beforeFailed);
    expect(getDeliveryState().deliveredCount).toBe(beforeDelivered + 1);
  });

  it("happy path: one notification delivered, message created, markNotificationDelivered called", async () => {
    const notifId = nid("n-happy");
    const taskId = tid("task1");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "assignment",
              title: "T",
              body: "B",
              taskId,
              accountId: config.accountId,
            },
            task: {
              _id: taskId,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
          });
        }
        return undefined;
      },
    );
    mockSendToOpenClaw.mockResolvedValue({
      text: "I will work on it.",
      toolCalls: [],
    });

    const before = getDeliveryState().deliveredCount;
    await _runOnePollCycle(config);

    expect(getDeliveryState().deliveredCount).toBe(before + 1);
    expect(mockSendToOpenClaw).toHaveBeenCalledTimes(1);
    const createMessageCall = mockAction.mock.calls.find(
      (c) =>
        (c[1] as Record<string, unknown>)?.content === "I will work on it.",
    );
    expect(createMessageCall).toBeDefined();
    expect(createMessageCall![1]).toMatchObject({
      taskId,
      accountId: config.accountId,
      serviceToken: config.serviceToken,
    });
  });

  it("HEARTBEAT_OK: marks delivered, no message created", async () => {
    const notifId = nid("n-heartbeat");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "thread_update",
              title: "T",
              body: "B",
              accountId: config.accountId,
            },
          });
        }
        return undefined;
      },
    );
    mockSendToOpenClaw.mockResolvedValue({
      text: "HEARTBEAT_OK",
      toolCalls: [],
    });

    const before = getDeliveryState().deliveredCount;
    await _runOnePollCycle(config);

    expect(getDeliveryState().deliveredCount).toBe(before + 1);
    const createMessageCalls = mockAction.mock.calls.filter(
      (c) => (c[1] as Record<string, unknown>)?.content != null,
    );
    expect(createMessageCalls).toHaveLength(0);
  });

  it("error path: sendToOpenClaw throws, markNotificationDeliveryEnded called and failedCount incremented", async () => {
    const notifId = nid("n-error");
    const taskId = tid("task-error");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "assignment",
              title: "T",
              body: "B",
              taskId,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: taskId,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
          });
        }
        return undefined;
      },
    );
    mockSendToOpenClaw.mockRejectedValue(new Error("Gateway error"));

    const before = getDeliveryState().failedCount;
    await _runOnePollCycle(config);

    expect(mockSendToOpenClaw).toHaveBeenCalledTimes(1);
    expect(getDeliveryState().failedCount).toBe(before + 1);
    expect(getDeliveryState().lastErrorMessage).toBeDefined();
    const deliveryEndedCalls = mockAction.mock.calls.filter(
      (c) =>
        (c[1] as Record<string, unknown>)?.notificationId === notifId &&
        !("limit" in (c[1] as object)),
    );
    expect(deliveryEndedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("no-response retry exhaustion: same notification returns empty 3 times then proceeds to exhausted and marks delivered", async () => {
    const notifId = nid("n-exhaust");
    const taskId = tid("task-exhaust");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "assignment",
              title: "T",
              body: "B",
              taskId,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: taskId,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
          });
        }
        return undefined;
      },
    );
    mockSendToOpenClaw.mockResolvedValue({ text: "", toolCalls: [] });

    const beforeDelivered = getDeliveryState().deliveredCount;
    const beforeExhausted =
      getDeliveryState().requiredNotificationRetryExhaustedCount;
    const beforeFailed = getDeliveryState().failedCount;

    await _runOnePollCycle(config);
    expect(getDeliveryState().failedCount).toBe(beforeFailed + 1);
    expect(getDeliveryState().deliveredCount).toBe(beforeDelivered);

    await _runOnePollCycle(config);
    expect(getDeliveryState().failedCount).toBe(beforeFailed + 2);
    expect(getDeliveryState().deliveredCount).toBe(beforeDelivered);

    await _runOnePollCycle(config);
    expect(getDeliveryState().deliveredCount).toBe(beforeDelivered + 1);
    expect(getDeliveryState().requiredNotificationRetryExhaustedCount).toBe(
      beforeExhausted + 1,
    );
    expect(getDeliveryState().failedCount).toBe(beforeFailed + 2);
  });

  it("returns finite positive delay", async () => {
    mockAction.mockResolvedValue([]);
    const delay = await _runOnePollCycle(config);
    expect(Number.isFinite(delay)).toBe(true);
    expect(delay).toBeGreaterThan(0);
  });

  it("every Convex action receives config.accountId and config.serviceToken", async () => {
    const notifId = nid("n-auth");
    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && "accountId" in a && "serviceToken" in a) {
          expect(a.accountId).toBe(config.accountId);
          expect(a.serviceToken).toBe(config.serviceToken);
        }
        if (a && a.limit === 50) return [{ _id: notifId }];
        if (a && a.notificationId === notifId && !("content" in a)) {
          return buildContext({
            notification: {
              _id: notifId,
              type: "thread_update",
              title: "T",
              body: "B",
              accountId: config.accountId,
            },
          });
        }
        return undefined;
      },
    );
    mockSendToOpenClaw.mockResolvedValue({ text: "OK", toolCalls: [] });

    await _runOnePollCycle(config);
  });

  it("two notifications with different session keys are processed in parallel", async () => {
    const n1 = nid("n-parallel-1");
    const n2 = nid("n-parallel-2");
    const t1 = tid("task-p1");
    const t2 = tid("task-p2");
    const session1 = "task:t1:agent:a:acc:v1";
    const session2 = "task:t2:agent:a:acc:v1";

    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: n1 }, { _id: n2 }];
        if (a && a.notificationId === n1 && !("content" in a)) {
          return buildContext({
            notification: {
              _id: n1,
              type: "assignment",
              title: "T",
              body: "B",
              taskId: t1,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: t1,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
            deliverySessionKey: session1,
          });
        }
        if (a && a.notificationId === n2 && !("content" in a)) {
          return buildContext({
            notification: {
              _id: n2,
              type: "assignment",
              title: "T",
              body: "B",
              taskId: t2,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: t2,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
            deliverySessionKey: session2,
          });
        }
        return undefined;
      },
    );

    const sendStartTimes: number[] = [];
    mockSendToOpenClaw.mockImplementation(async (sessionKey: string) => {
      sendStartTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return { text: "OK", toolCalls: [] };
    });

    const beforeDelivered = getDeliveryState().deliveredCount;
    const cycleStart = Date.now();
    await _runOnePollCycle(config);
    const cycleDuration = Date.now() - cycleStart;

    expect(sendStartTimes).toHaveLength(2);
    expect(cycleDuration).toBeLessThan(120);
    const overlap = sendStartTimes[1] - sendStartTimes[0] < 40;
    expect(overlap).toBe(true);
    expect(getDeliveryState().deliveredCount).toBe(beforeDelivered + 2);
  });

  it("two notifications with same session key are processed sequentially", async () => {
    const n1 = nid("n-seq-1");
    const n2 = nid("n-seq-2");
    const t1 = tid("task-seq");
    const sessionKey = "task:seq:agent:a:acc:v1";

    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: n1 }, { _id: n2 }];
        if (a && a.notificationId === n1 && !("content" in a)) {
          return buildContext({
            notification: {
              _id: n1,
              type: "assignment",
              title: "T",
              body: "B",
              taskId: t1,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: t1,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
            deliverySessionKey: sessionKey,
          });
        }
        if (a && a.notificationId === n2 && !("content" in a)) {
          return buildContext({
            notification: {
              _id: n2,
              type: "assignment",
              title: "T",
              body: "B",
              taskId: t1,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: t1,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
            deliverySessionKey: sessionKey,
          });
        }
        return undefined;
      },
    );

    const sendOrder: string[] = [];
    mockSendToOpenClaw.mockImplementation(async (key: string) => {
      sendOrder.push(key);
      return { text: "OK", toolCalls: [] };
    });

    await _runOnePollCycle(config);

    expect(mockSendToOpenClaw).toHaveBeenCalledTimes(2);
    expect(sendOrder).toEqual([sessionKey, sessionKey]);
  });

  it("retry in one stream does not block another stream", async () => {
    const n1 = nid("n-retry-1");
    const n2 = nid("n-retry-2");
    const t1 = tid("task-r1");
    const t2 = tid("task-r2");
    const session1 = "task:r1:agent:a:acc:v1";
    const session2 = "task:r2:agent:a:acc:v1";

    mockAction.mockImplementation(
      async (_actionRef: unknown, args: unknown) => {
        const a = args as Record<string, unknown> | undefined;
        if (a && a.limit === 50) return [{ _id: n1 }, { _id: n2 }];
        if (a && a.notificationId === n1 && !("content" in a)) {
          return buildContext({
            notification: {
              _id: n1,
              type: "assignment",
              title: "T",
              body: "B",
              taskId: t1,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: t1,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
            deliverySessionKey: session1,
          });
        }
        if (a && a.notificationId === n2 && !("content" in a)) {
          return buildContext({
            notification: {
              _id: n2,
              type: "assignment",
              title: "T",
              body: "B",
              taskId: t2,
              recipientType: "agent",
              recipientId: "agent-a",
              accountId: config.accountId,
            },
            task: {
              _id: t2,
              status: "assigned",
              title: "T",
              assignedAgentIds: [aid("agent-a")],
            },
            deliverySessionKey: session2,
          });
        }
        return undefined;
      },
    );

    mockSendToOpenClaw.mockImplementation(async (sessionKey: string) => {
      if (sessionKey === session1) return { text: "", toolCalls: [] };
      return { text: "OK", toolCalls: [] };
    });

    const beforeFailed = getDeliveryState().failedCount;
    const beforeDelivered = getDeliveryState().deliveredCount;
    await _runOnePollCycle(config);

    expect(getDeliveryState().failedCount).toBe(beforeFailed + 1);
    expect(getDeliveryState().deliveredCount).toBe(beforeDelivered + 1);
    const deliveryEndedCalls = mockAction.mock.calls.filter(
      (c) => (c[1] as Record<string, unknown>)?.notificationId === n1,
    );
    const markDeliveredCalls = mockAction.mock.calls.filter(
      (c) => (c[1] as Record<string, unknown>)?.notificationId === n2,
    );
    expect(deliveryEndedCalls.length).toBeGreaterThanOrEqual(1);
    expect(markDeliveredCalls.length).toBeGreaterThanOrEqual(1);
  });
});
