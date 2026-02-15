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

const TEST_PORT = 39493;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const AGENT_ENDPOINTS = [
  "/agent/task-status",
  "/agent/task-update",
  "/agent/task-create",
  "/agent/task-assign",
  "/agent/response-request",
  "/agent/document",
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
  api: {},
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
    openclawConfigPath: "/tmp/test/openclaw.json",
    openclawAgentsMdPath: undefined,
    openclawHeartbeatMdPath: "/tmp/test/HEARTBEAT.md",
    openclawProfileSyncEnabled: false,
  } as RuntimeConfig;
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
      const res = await fetch(`${BASE}${endpoint}`, { method: "GET" });
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    },
  );

  it.each(AGENT_ENDPOINTS)(
    "POST %s without x-openclaw-session-key returns 401",
    async (endpoint) => {
      const res = await fetch(`${BASE}${endpoint}`, {
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
        "x-openclaw-session-key": "agent:unknown:account",
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
        "x-openclaw-session-key": "agent:unknown:account",
      },
      body: JSON.stringify({ title: "Test task" }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { success?: boolean; error?: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain("Unknown session key");
  });
});
