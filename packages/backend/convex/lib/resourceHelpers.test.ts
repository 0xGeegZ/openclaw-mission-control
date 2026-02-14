/**
 * Tests for resource management helpers.
 * Unit tests for quota checking, resource tracking, and metrics.
 */
import { expect, test, describe, beforeEach, vi } from "vitest";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { Id } from "./_generated/dataModel";
import { ACCOUNT_PLAN } from "./constants";
import {
  RESOURCE_LIMITS,
  getResourceQuota,
  checkResourceQuota,
  incrementResourceUsage,
  decrementResourceUsage,
} from "./resourceHelpers";

// Mock context factory
const createMockCtx = (overrides?: Partial<MutationCtx | QueryCtx>) => {
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
  } as any;
};

describe("RESOURCE_LIMITS constants", () => {
  test("should define limits for all plan tiers", () => {
    expect(RESOURCE_LIMITS[ACCOUNT_PLAN.FREE]).toBeDefined();
    expect(RESOURCE_LIMITS[ACCOUNT_PLAN.PRO]).toBeDefined();
    expect(RESOURCE_LIMITS[ACCOUNT_PLAN.ENTERPRISE]).toBeDefined();
  });

  test("free plan should have lower limits than pro", () => {
    const free = RESOURCE_LIMITS[ACCOUNT_PLAN.FREE];
    const pro = RESOURCE_LIMITS[ACCOUNT_PLAN.PRO];

    expect(free.maxCpuPerContainer).toBeLessThan(pro.maxCpuPerContainer);
    expect(free.maxMemoryPerContainer).toBeLessThan(pro.maxMemoryPerContainer);
    expect(free.maxDiskPerContainer).toBeLessThan(pro.maxDiskPerContainer);
  });

  test("pro plan should have lower limits than enterprise", () => {
    const pro = RESOURCE_LIMITS[ACCOUNT_PLAN.PRO];
    const enterprise = RESOURCE_LIMITS[ACCOUNT_PLAN.ENTERPRISE];

    expect(pro.maxCpuPerContainer).toBeLessThan(enterprise.maxCpuPerContainer);
    expect(pro.maxMemoryPerContainer).toBeLessThan(
      enterprise.maxMemoryPerContainer,
    );
    expect(pro.maxDiskPerContainer).toBeLessThan(enterprise.maxDiskPerContainer);
  });
});

describe("checkResourceQuota", () => {
  test("should allow creation within free plan limits", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.FREE,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.FREE,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.FREE],
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });

    const result = await checkResourceQuota(
      ctx,
      account._id,
      500, // 500m CPU (free limit)
      512, // 512MB memory (free limit)
      5120, // 5GB disk (free limit)
    );

    expect(result.allowed).toBe(true);
  });

  test("should deny creation exceeding per-container CPU limit", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.FREE,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.FREE,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.FREE],
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });

    const result = await checkResourceQuota(
      ctx,
      account._id,
      1000, // 1000m (exceeds free limit of 500m)
      512,
      5120,
    );

    expect(result.allowed).toBe(false);
    expect(result.message).toContain("CPU limit");
  });

  test("should deny creation exceeding per-container memory limit", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.FREE,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.FREE,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.FREE],
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });

    const result = await checkResourceQuota(
      ctx,
      account._id,
      500,
      1024, // 1024MB (exceeds free limit of 512MB)
      5120,
    );

    expect(result.allowed).toBe(false);
    expect(result.message).toContain("Memory limit");
  });

  test("should deny creation exceeding aggregate CPU quota", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.FREE,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.FREE,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.FREE],
      currentTotalCpuInUse: 450, // Already using most of the free quota
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });

    const result = await checkResourceQuota(
      ctx,
      account._id,
      500, // Would exceed total available
      512,
      5120,
    );

    expect(result.allowed).toBe(false);
    expect(result.message).toContain("Insufficient CPU quota");
  });

  test("should allow creation on pro plan with higher limits", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.PRO,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.PRO,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.PRO],
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });

    const result = await checkResourceQuota(
      ctx,
      account._id,
      2000, // 2 cores (pro limit)
      4096, // 4GB (pro limit)
      51200, // 50GB (pro limit)
    );

    expect(result.allowed).toBe(true);
  });
});

describe("incrementResourceUsage", () => {
  test("should increment all resource counters", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.FREE,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.FREE,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.FREE],
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });
    (ctx.db.patch as any).mockResolvedValue(null);

    await incrementResourceUsage(ctx, account._id, 500, 512, 5120);

    expect(ctx.db.patch).toHaveBeenCalledWith(quota._id, expect.objectContaining({
      currentTotalCpuInUse: 500,
      currentTotalMemoryInUse: 512,
      currentTotalDiskInUse: 5120,
    }));
  });

  test("should add to existing usage", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.PRO,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.PRO,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.PRO],
      currentTotalCpuInUse: 1000,
      currentTotalMemoryInUse: 2048,
      currentTotalDiskInUse: 25600,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });
    (ctx.db.patch as any).mockResolvedValue(null);

    await incrementResourceUsage(ctx, account._id, 500, 512, 5120);

    expect(ctx.db.patch).toHaveBeenCalledWith(quota._id, expect.objectContaining({
      currentTotalCpuInUse: 1500,
      currentTotalMemoryInUse: 2560,
      currentTotalDiskInUse: 30720,
    }));
  });
});

describe("decrementResourceUsage", () => {
  test("should decrement all resource counters", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.FREE,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.FREE,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.FREE],
      currentTotalCpuInUse: 500,
      currentTotalMemoryInUse: 512,
      currentTotalDiskInUse: 5120,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });
    (ctx.db.patch as any).mockResolvedValue(null);

    await decrementResourceUsage(ctx, account._id, 500, 512, 5120);

    expect(ctx.db.patch).toHaveBeenCalledWith(quota._id, expect.objectContaining({
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
    }));
  });

  test("should not go below zero", async () => {
    const ctx = createMockCtx();
    const account = {
      _id: "account_1" as Id<"accounts">,
      plan: ACCOUNT_PLAN.FREE,
    };
    const quota = {
      _id: "quota_1" as Id<"resourceQuotas">,
      accountId: account._id,
      planId: ACCOUNT_PLAN.FREE,
      ...RESOURCE_LIMITS[ACCOUNT_PLAN.FREE],
      currentTotalCpuInUse: 100,
      currentTotalMemoryInUse: 100,
      currentTotalDiskInUse: 1000,
      updatedAt: Date.now(),
    };

    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.query("resourceQuotas").withIndex() as any).mockReturnValue({
      first: vi.fn().mockResolvedValue(quota),
    });
    (ctx.db.patch as any).mockResolvedValue(null);

    await decrementResourceUsage(ctx, account._id, 500, 512, 5120);

    expect(ctx.db.patch).toHaveBeenCalledWith(quota._id, expect.objectContaining({
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
    }));
  });
});
