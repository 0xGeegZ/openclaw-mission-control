/**
 * Integration tests for health server public endpoints.
 *
 * Uses a real HTTP server instance and validates response shape/content for:
 * - GET /health
 * - GET /version
 * - GET /metrics (prometheus + json)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startHealthServer, stopHealthServer } from "../health";
import type { RuntimeConfig } from "../config";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

const TEST_PORT = 39494;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

/** Retry fetch a few times to tolerate server warm-up or transient ECONNRESET. */
async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  maxAttempts = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

vi.mock("../gateway", () => ({
  getGatewayState: vi.fn().mockReturnValue({
    isRunning: true,
    sessions: new Map([["s1", "a1"]]),
    lastSendAt: Date.now(),
    lastSendError: null,
  }),
  getAgentIdForSessionKey: vi.fn().mockReturnValue(null),
}));

vi.mock("../delivery", () => ({
  getDeliveryState: vi.fn().mockReturnValue({
    isRunning: true,
    lastDelivery: Date.now(),
    deliveredCount: 12,
    failedCount: 1,
    consecutiveFailures: 0,
    lastErrorAt: null,
    lastErrorMessage: null,
    noResponseFailures: new Map(),
    noResponseTerminalSkipCount: 0,
    requiredNotificationRetryExhaustedCount: 0,
  }),
}));

vi.mock("../heartbeat", () => ({
  getHeartbeatState: vi.fn().mockReturnValue({
    isRunning: true,
    scheduledCount: 3,
  }),
}));

vi.mock("../agent-sync", () => ({
  getAgentSyncState: vi.fn().mockReturnValue({
    running: true,
    lastSyncAt: Date.now(),
    lastError: null,
    addedCount: 2,
    removedCount: 0,
  }),
}));

function createRuntimeConfig(): RuntimeConfig {
  return {
    accountId: "test-account-id" as Id<"accounts">,
    convexUrl: "https://test.convex.cloud",
    serviceToken: "mc_service_test-account-id_secret",
    healthPort: TEST_PORT,
    healthHost: "127.0.0.1",
    deliveryInterval: 5_000,
    healthCheckInterval: 10_000,
    agentSyncInterval: 60_000,
    logLevel: "info",
    deliveryBackoffBaseMs: 1_000,
    deliveryBackoffMaxMs: 60_000,
    runtimeServiceVersion: "0.0.0-test",
    openclawVersion: "test",
    dropletId: "droplet-test",
    dropletIp: "127.0.0.1",
    dropletRegion: "test-region",
    openclawGatewayUrl: "",
    openclawGatewayToken: undefined,
    openclawRequestTimeoutMs: 300_000,
    openclawClientToolsEnabled: true,
    taskStatusBaseUrl: BASE_URL,
    openclawWorkspaceRoot: "/tmp/test",
    openclawConfigPath: "/tmp/test/openclaw.json",
    openclawAgentsMdPath: undefined,
    openclawHeartbeatMdPath: "/tmp/test/HEARTBEAT.md",
    openclawProfileSyncEnabled: false,
  } as RuntimeConfig;
}

describe("health server public endpoints", () => {
  beforeEach(async () => {
    startHealthServer(createRuntimeConfig());
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  afterEach(() => {
    stopHealthServer();
  });

  it("returns full health payload on GET /health", async () => {
    const response = await fetchWithRetry(`${BASE_URL}/health`);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      status: string;
      versions: { runtimeService: string; openclaw: string };
      infrastructure: { dropletId: string; region: string };
      gateway: { running: boolean; sessions: number };
      delivery: { running: boolean };
      heartbeat: { running: boolean };
      agentSync: { running: boolean };
      memory: unknown;
      timestamp: number;
    };

    expect(payload.status).toBe("healthy");
    expect(payload.versions.runtimeService).toBe("0.0.0-test");
    expect(payload.versions.openclaw).toBe("test");
    expect(payload.infrastructure.dropletId).toBe("droplet-test");
    expect(payload.infrastructure.region).toBe("test-region");
    expect(payload.gateway.running).toBe(true);
    expect(payload.gateway.sessions).toBe(1);
    expect(payload.delivery.running).toBe(true);
    expect(payload.heartbeat.running).toBe(true);
    expect(payload.agentSync.running).toBe(true);
    expect(payload.memory).toBeTruthy();
    expect(typeof payload.timestamp).toBe("number");
  });

  it("returns version info on GET /version", async () => {
    const response = await fetchWithRetry(`${BASE_URL}/version`);
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      runtimeServiceVersion: string;
      openclawVersion: string;
      dropletId: string;
      region: string;
    };

    expect(payload.runtimeServiceVersion).toBe("0.0.0-test");
    expect(payload.openclawVersion).toBe("test");
    expect(payload.dropletId).toBe("droplet-test");
    expect(payload.region).toBe("test-region");
  });

  it("returns prometheus text by default on GET /metrics", async () => {
    const response = await fetchWithRetry(`${BASE_URL}/metrics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");

    const body = await response.text();
    expect(typeof body).toBe("string");
  });

  it("returns json metrics when Accept: application/json", async () => {
    const response = await fetchWithRetry(`${BASE_URL}/metrics`, {
      headers: { Accept: "application/json" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const payload = (await response.json()) as {
      operations: Record<string, unknown>;
      runtime: { uptime: number };
      components: {
        delivery: { running: boolean };
        gateway: { running: boolean };
        heartbeat: { running: boolean };
      };
      timestamp: number;
    };

    expect(payload.operations).toBeDefined();
    expect(payload.runtime.uptime).toBeGreaterThanOrEqual(0);
    expect(payload.components.delivery.running).toBe(true);
    expect(payload.components.gateway.running).toBe(true);
    expect(payload.components.heartbeat.running).toBe(true);
    expect(typeof payload.timestamp).toBe("number");
  });

  it("returns 404 for unknown public endpoints", async () => {
    const response = await fetchWithRetry(`${BASE_URL}/does-not-exist`);
    expect(response.status).toBe(404);
  });

  it("matches known endpoints when query params are present", async () => {
    const healthResponse = await fetchWithRetry(`${BASE_URL}/health?verbose=1`);
    expect(healthResponse.status).toBe(200);

    const metricsResponse = await fetchWithRetry(
      `${BASE_URL}/metrics?format=json`,
      {
        headers: { Accept: "application/json" },
      },
    );
    expect(metricsResponse.status).toBe(200);
  });
});
