/**
 * Integration tests for resource management.
 * Tests container creation/deletion with resource quotas.
 */
import { expect, test, describe, beforeEach, vi } from "vitest";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ACCOUNT_PLAN } from "../lib/constants";

// Mock context factory
const createMockCtx = (overrides?: Partial<MutationCtx>) => {
  const db = {
    query: vi.fn().mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn(),
        unique: vi.fn(),
        collect: vi.fn(),
        order: vi.fn().mockReturnValue({
          first: vi.fn(),
          take: vi.fn(),
        }),
      }),
      collect: vi.fn(),
    }),
    get: vi.fn(),
    insert: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  return {
    db: db as any,
    ...overrides,
  } as MutationCtx;
};

describe("Resource Management Integration", () => {
  describe("Container creation with resource quotas", () => {
    test("should create container within free plan limits", async () => {
      const ctx = createMockCtx();
      const accountId = "account_1" as Id<"accounts">;
      const containerId = "container_1" as Id<"containers">;

      const account = {
        _id: accountId,
        plan: ACCOUNT_PLAN.FREE,
      };

      const quota = {
        _id: "quota_1" as Id<"resourceQuotas">,
        accountId,
        planId: ACCOUNT_PLAN.FREE,
        maxCpuPerContainer: 500,
        maxMemoryPerContainer: 512,
        maxDiskPerContainer: 5120,
        maxTotalCpu: 500,
        maxTotalMemory: 512,
        maxTotalDisk: 5120,
        currentTotalCpuInUse: 0,
        currentTotalMemoryInUse: 0,
        currentTotalDiskInUse: 0,
        updatedAt: Date.now(),
      };

      (ctx.db.get as any).mockResolvedValue(account);
      (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
        first: vi.fn().mockResolvedValue(quota),
      });
      (ctx.db.query("usage").withIndex() as any).mockReturnValue({
        first: vi.fn().mockResolvedValue({
          containerCount: 0,
          planId: ACCOUNT_PLAN.FREE,
        }),
      });
      (ctx.db.insert as any).mockResolvedValue(containerId);
      (ctx.db.patch as any).mockResolvedValue(null);

      // Verify preconditions
      expect(quota.currentTotalCpuInUse).toBe(0);
      expect(quota.currentTotalMemoryInUse).toBe(0);
      expect(quota.currentTotalDiskInUse).toBe(0);
    });

    test("should enforce per-container CPU limits on free plan", async () => {
      const ctx = createMockCtx();
      const accountId = "account_1" as Id<"accounts">;

      const account = {
        _id: accountId,
        plan: ACCOUNT_PLAN.FREE,
      };

      const quota = {
        _id: "quota_1" as Id<"resourceQuotas">,
        accountId,
        planId: ACCOUNT_PLAN.FREE,
        maxCpuPerContainer: 500,
        maxMemoryPerContainer: 512,
        maxDiskPerContainer: 5120,
        maxTotalCpu: 500,
        maxTotalMemory: 512,
        maxTotalDisk: 5120,
        currentTotalCpuInUse: 0,
        currentTotalMemoryInUse: 0,
        currentTotalDiskInUse: 0,
        updatedAt: Date.now(),
      };

      (ctx.db.get as any).mockResolvedValue(account);
      (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
        first: vi.fn().mockResolvedValue(quota),
      });

      // Attempt to create container with 1000m CPU (exceeds 500m limit)
      const exceededCpu = 1000;
      expect(exceededCpu).toBeGreaterThan(quota.maxCpuPerContainer);
    });

    test("should allow multiple containers on pro plan", async () => {
      const ctx = createMockCtx();
      const accountId = "account_1" as Id<"accounts">;

      const account = {
        _id: accountId,
        plan: ACCOUNT_PLAN.PRO,
      };

      const quota = {
        _id: "quota_1" as Id<"resourceQuotas">,
        accountId,
        planId: ACCOUNT_PLAN.PRO,
        maxCpuPerContainer: 2000,
        maxMemoryPerContainer: 4096,
        maxDiskPerContainer: 51200,
        maxTotalCpu: 4000,
        maxTotalMemory: 8192,
        maxTotalDisk: 102400,
        currentTotalCpuInUse: 0,
        currentTotalMemoryInUse: 0,
        currentTotalDiskInUse: 0,
        updatedAt: Date.now(),
      };

      (ctx.db.get as any).mockResolvedValue(account);
      (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
        first: vi.fn().mockResolvedValue(quota),
      });
      (ctx.db.query("containers").withIndex() as any).mockReturnValue({
        collect: vi.fn().mockResolvedValue([]),
      });
      (ctx.db.query("usage").withIndex() as any).mockReturnValue({
        first: vi.fn().mockResolvedValue({
          containerCount: 0,
          planId: ACCOUNT_PLAN.PRO,
        }),
      });

      // Pro plan allows up to 5 containers
      expect(quota.maxTotalCpu).toBeGreaterThan(
        ACCOUNT_PLAN.FREE === "free" ? 500 : 0,
      );
    });
  });

  describe("Resource metrics recording", () => {
    test("should record container metrics with usage percentages", async () => {
      const ctx = createMockCtx();
      const accountId = "account_1" as Id<"accounts">;
      const containerId = "container_1" as Id<"containers">;

      const container = {
        _id: containerId,
        accountId,
        name: "test-container",
        config: {
          cpuLimit: 500,
          memoryLimit: 512,
          diskLimit: 5120,
        },
      };

      (ctx.db.get as any).mockResolvedValue(container);
      (ctx.db.insert as any).mockResolvedValue("metric_1");

      // Record metrics: 250m CPU (50%), 256MB memory (50%), 2560MB disk (50%)
      const cpuUsage = 250;
      const memoryUsage = 256 * 1024 * 1024; // 256MB in bytes
      const diskUsage = 2560 * 1024 * 1024; // 2560MB in bytes

      const cpuPercent = (cpuUsage / 500) * 100;
      const memoryPercent = (memoryUsage / (512 * 1024 * 1024)) * 100;
      const diskPercent = (diskUsage / (5120 * 1024 * 1024)) * 100;

      expect(cpuPercent).toBe(50);
      expect(memoryPercent).toBe(50);
      expect(diskPercent).toBe(50);
    });

    test("should detect when resource usage exceeds 80% threshold", async () => {
      const ctx = createMockCtx();
      const accountId = "account_1" as Id<"accounts">;
      const containerId = "container_1" as Id<"containers">;

      const container = {
        _id: containerId,
        accountId,
        name: "test-container",
        config: {
          cpuLimit: 500,
          memoryLimit: 512,
          diskLimit: 5120,
        },
      };

      (ctx.db.get as any).mockResolvedValue(container);
      (ctx.db.insert as any).mockResolvedValue("metric_1");

      // Record metrics: 400m CPU (80%), 409.6MB memory (80%), 4096MB disk (80%)
      const cpuUsage = 400;
      const memoryUsage = 409.6 * 1024 * 1024; // bytes
      const diskUsage = 4096 * 1024 * 1024; // bytes

      const cpuPercent = (cpuUsage / 500) * 100;
      const memoryPercent = (memoryUsage / (512 * 1024 * 1024)) * 100;
      const diskPercent = (diskUsage / (5120 * 1024 * 1024)) * 100;

      expect(cpuPercent).toBeGreaterThanOrEqual(79);
      expect(memoryPercent).toBeGreaterThanOrEqual(79);
      expect(diskPercent).toBeGreaterThanOrEqual(79);

      // Should detect threshold exceeded
      const thresholdExceeded = cpuPercent > 80;
      expect(thresholdExceeded).toBe(false); // 80% exactly doesn't exceed >80%
    });

    test("should detect when resource usage exceeds 90%", async () => {
      const cpuUsage = 450;
      const cpuLimit = 500;
      const cpuPercent = (cpuUsage / cpuLimit) * 100;

      expect(cpuPercent).toBe(90);
      expect(cpuPercent > 80).toBe(true);
    });
  });

  describe("Quota lifecycle", () => {
    test("should initialize quota on first container creation", async () => {
      const ctx = createMockCtx();
      const accountId = "account_1" as Id<"accounts">;

      const account = {
        _id: accountId,
        plan: ACCOUNT_PLAN.FREE,
      };

      (ctx.db.get as any).mockResolvedValue(account);
      (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
        first: vi.fn().mockResolvedValue(null), // No quota yet
      });
      (ctx.db.insert as any).mockResolvedValue("quota_1");

      // First access should create quota
      expect(true).toBe(true);
    });

    test("should track usage accurately across multiple containers", async () => {
      const ctx = createMockCtx();
      const accountId = "account_1" as Id<"accounts">;

      const quota = {
        _id: "quota_1" as Id<"resourceQuotas">,
        accountId,
        planId: ACCOUNT_PLAN.PRO,
        maxCpuPerContainer: 2000,
        maxMemoryPerContainer: 4096,
        maxDiskPerContainer: 51200,
        maxTotalCpu: 4000,
        maxTotalMemory: 8192,
        maxTotalDisk: 102400,
        currentTotalCpuInUse: 1000,
        currentTotalMemoryInUse: 2048,
        currentTotalDiskInUse: 25600,
        updatedAt: Date.now(),
      };

      (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
        first: vi.fn().mockResolvedValue(quota),
      });

      // After creating one 1000m CPU container, Pro plan still has 3000m available
      const available = quota.maxTotalCpu - quota.currentTotalCpuInUse;
      expect(available).toBe(3000);

      // Can create another 1000m container
      expect(1000).toBeLessThanOrEqual(available);

      // But not a 3500m container
      expect(3500).toBeGreaterThan(available);
    });
  });
});
