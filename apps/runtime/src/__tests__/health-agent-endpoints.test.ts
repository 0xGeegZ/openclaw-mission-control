/**
 * Tests for health server agent endpoint session validation.
 *
 * Covers requireLocalAgentSession behavior: method, local-only, session key.
 * Uses real HTTP server with mocked gateway; isLocalAddress tested in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isLocalAddress } from "../health";
import { startHealthServer, stopHealthServer } from "../health";
import type { RuntimeConfig } from "../config";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { getConvexClient } from "../convex-client";
import { getAgentIdForSessionKey } from "../gateway";

const TEST_PORT = 39493;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const AGENT_ENDPOINTS = [
  "/agent/task-status",
  "/agent/task-update",
  "/agent/task-create",
  "/agent/task-assign",
  "/agent/response-request",
  "/agent/document",
  "/agent/document-list",
  "/agent/task-message",
  "/agent/task-list",
  "/agent/task-get",
  "/agent/task-thread",
  "/agent/task-search",
  "/agent/task-load",
  "/agent/get-agent-skills",
  "/agent/task-delete",
  "/agent/task-link-pr",
] as const;

vi.mock("../gateway", () => ({
  getAgentIdForSessionKey: vi.fn().mockReturnValue(null),
  getGatewayState: vi.fn().mockReturnValue({
    isRunning: false,
    sessions: new Map(),
    lastSendAt: null,
    lastSendError: null,
  }),
}));

vi.mock("../convex-client", () => ({
  getConvexClient: vi.fn(),
  api: { service: { actions: {} } },
}));

vi.mock("../agent-sync", () => ({
  getAgentSyncState: vi.fn().mockReturnValue({
    running: false,
    lastSyncAt: null,
    lastError: null,
    addedCount: 0,
    removedCount: 0,
  }),
}));

vi.mock("../delivery", () => ({
  getDeliveryState: vi.fn().mockReturnValue({
    isRunning: false,
    lastDelivery: null,
    deliveredCount: 0,
    failedCount: 0,
    consecutiveFailures: 0,
    lastErrorAt: null,
    lastErrorMessage: null,
    noResponseTerminalSkipCount: 0,
    requiredNotificationRetryExhaustedCount: 0,
  }),
}));

vi.mock("../heartbeat", () => ({
  getHeartbeatState: vi.fn().mockReturnValue({
    isRunning: false,
    scheduledCount: 0,
  }),
}));

vi.mock("../metrics", () => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  getAllMetrics: vi.fn().mockReturnValue({}),
  formatPrometheusMetrics: vi.fn().mockReturnValue(""),
}));

function minimalHealthConfig(): RuntimeConfig {
  return {
    accountId: "test-account-id" as Id<"accounts">,
    convexUrl: "https://test.convex.cloud",
    serviceToken: "mc_service_test-account-id_secret",
    healthPort: TEST_PORT,
    healthHost: "127.0.0.1",
    deliveryInterval: 5000,
    healthCheckInterval: 10000,
    agentSyncInterval: 60000,
    logLevel: "info",
    deliveryBackoffBaseMs: 1000,
    deliveryBackoffMaxMs: 60000,
    runtimeServiceVersion: "0.0.0-test",
    openclawVersion: "test",
    dropletId: "",
    dropletIp: "127.0.0.1",
    dropletRegion: "",
    openclawGatewayUrl: "",
    openclawGatewayToken: undefined,
    openclawRequestTimeoutMs: 300000,
    openclawClientToolsEnabled: true,
    taskStatusBaseUrl: `http://127.0.0.1:${TEST_PORT}`,
    openclawWorkspaceRoot: "/tmp/test",
    openclawConfigWorkspaceRoot: "/tmp/test",
    openclawConfigPath: "/tmp/test/openclaw.json",
    openclawAgentsMdPath: undefined,
    openclawHeartbeatMdPath: "/tmp/test/HEARTBEAT.md",
    openclawProfileSyncEnabled: false,
  } as RuntimeConfig;
}

/**
 * Retries fetch a few times to tolerate short-lived startup/teardown socket races
 * in local HTTP integration tests.
 */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxAttempts = 3,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

describe("isLocalAddress", () => {
  it("returns false for undefined", () => {
    expect(isLocalAddress(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLocalAddress("")).toBe(false);
  });

  it("returns true for IPv6 loopback", () => {
    expect(isLocalAddress("::1")).toBe(true);
  });

  it("returns true for IPv4 loopback", () => {
    expect(isLocalAddress("127.0.0.1")).toBe(true);
  });

  it("returns true for IPv4-mapped IPv6 loopback", () => {
    expect(isLocalAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("returns true for private 10.x", () => {
    expect(isLocalAddress("10.0.0.1")).toBe(true);
    expect(isLocalAddress("10.255.255.255")).toBe(true);
  });

  it("returns true for private 172.16-31.x", () => {
    expect(isLocalAddress("172.16.0.1")).toBe(true);
    expect(isLocalAddress("172.31.255.255")).toBe(true);
  });

  it("returns true for private 192.168.x.x", () => {
    expect(isLocalAddress("192.168.1.1")).toBe(true);
  });

  it("returns false for public IPv4", () => {
    expect(isLocalAddress("8.8.8.8")).toBe(false);
    expect(isLocalAddress("1.2.3.4")).toBe(false);
  });

  it("returns false for invalid address", () => {
    expect(isLocalAddress("not-an-ip")).toBe(false);
    expect(isLocalAddress("256.1.1.1")).toBe(false);
  });
});

describe("agent endpoints - session validation", () => {
  beforeEach(async () => {
    startHealthServer(minimalHealthConfig());
    await new Promise((r) => setTimeout(r, 20));
  });

  afterEach(() => {
    stopHealthServer();
  });

  it.each(AGENT_ENDPOINTS)(
    "GET %s returns 405 Method Not Allowed",
    async (endpoint) => {
      const res = await fetchWithRetry(`${BASE}${endpoint}`, { method: "GET" });
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    },
  );

  it.each(AGENT_ENDPOINTS)(
    "POST %s without x-openclaw-session-key returns 401",
    async (endpoint) => {
      const res = await fetchWithRetry(`${BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
      const data = (await res.json()) as { success?: boolean; error?: string };
      expect(data.success).toBe(false);
      expect(data.error).toContain("x-openclaw-session-key");
    },
  );

  it("POST /agent/task-status with unknown session key returns 401", async () => {
    const res = await fetch(`${BASE}/agent/task-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openclaw-session-key": "system:agent:unknown:account:v1",
      },
      body: JSON.stringify({ taskId: "abc", status: "in_progress" }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain("Unknown session key");
  });

  it("POST /agent/task-create with unknown session key returns 401", async () => {
    const res = await fetch(`${BASE}/agent/task-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openclaw-session-key": "system:agent:unknown:account:v1",
      },
      body: JSON.stringify({ title: "Test task" }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain("Unknown session key");
  });
});

describe("POST /agent/task-create orchestrator parity", () => {
  const orchestratorId = "agent-orch1" as Id<"agents">;
  const engineerId = "agent-eng1" as Id<"agents">;
  const sessionKey = "system:agent:squad-lead:test-account-id:v1";

  const mockAction = vi.fn();

  beforeEach(async () => {
    vi.mocked(getAgentIdForSessionKey).mockReturnValue(orchestratorId);
    vi.mocked(getConvexClient).mockReturnValue({
      action: mockAction,
    } as unknown as ReturnType<typeof getConvexClient>);
    mockAction
      .mockResolvedValueOnce({ orchestratorAgentId: orchestratorId })
      .mockResolvedValueOnce([
        { _id: orchestratorId, slug: "squad-lead" },
        { _id: engineerId, slug: "engineer" },
      ])
      .mockResolvedValueOnce({ orchestratorAgentId: orchestratorId })
      .mockResolvedValueOnce({ taskId: "task1" });
    startHealthServer(minimalHealthConfig());
    await new Promise((r) => setTimeout(r, 20));
  });

  afterEach(() => {
    stopHealthServer();
    mockAction.mockReset();
  });

  it("sends status inbox and assignedAgentIds excluding orchestrator when orchestrator creates with assigneeSlugs", async () => {
    const res = await fetch(`${BASE}/agent/task-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openclaw-session-key": sessionKey,
      },
      body: JSON.stringify({
        title: "Implement feature",
        status: "assigned",
        assigneeSlugs: ["squad-lead", "engineer"],
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success?: boolean; taskId?: string };
    expect(data.success).toBe(true);
    expect(data.taskId).toBe("task1");

    const createCall = mockAction.mock.calls.find(
      (call) => (call[1] as { title?: string }).title === "Implement feature",
    );
    expect(createCall).toBeDefined();
    expect(createCall?.[1]).toMatchObject({
      status: "inbox",
      assignedAgentIds: [engineerId],
    });
  });

  it("sends status inbox and no assignees when only orchestrator in assigneeSlugs", async () => {
    mockAction.mockReset();
    mockAction
      .mockResolvedValueOnce({ orchestratorAgentId: orchestratorId })
      .mockResolvedValueOnce([{ _id: orchestratorId, slug: "squad-lead" }])
      .mockResolvedValueOnce({ orchestratorAgentId: orchestratorId })
      .mockResolvedValueOnce({ taskId: "task2" });

    const res = await fetch(`${BASE}/agent/task-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-openclaw-session-key": sessionKey,
      },
      body: JSON.stringify({
        title: "Solo orchestrator",
        status: "assigned",
        assigneeSlugs: ["squad-lead"],
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success?: boolean; taskId?: string };
    expect(data.success).toBe(true);
    expect(data.taskId).toBe("task2");

    const createCall = mockAction.mock.calls.find(
      (call) => (call[1] as { title?: string }).title === "Solo orchestrator",
    );
    expect(createCall).toBeDefined();
    expect(createCall?.[1]).toMatchObject({ status: "inbox" });
    const payload = createCall?.[1] as { assignedAgentIds?: unknown };
    expect(
      payload.assignedAgentIds === undefined ||
        (Array.isArray(payload.assignedAgentIds) &&
          payload.assignedAgentIds.length === 0),
    ).toBe(true);
  });
});
