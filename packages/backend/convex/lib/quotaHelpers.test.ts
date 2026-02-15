/**
 * Tests for quota helpers and subscription enforcement.
 */
import { expect, test, describe, beforeEach, vi } from "vitest";
import {
  checkQuota,
  incrementUsage,
  decrementUsage,
  initializeAccountUsage,
  resetMonthlyQuota,
  resetDailyQuota,
  getPlanQuota,
  type QuotaCheckResult,
} from "./quotaHelpers";
import { PLAN_QUOTAS, RESET_CYCLES, ACCOUNT_PLAN } from "./constants";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { Id } from "../_generated/dataModel";

// Mock context
const createMockCtx = (overrides?: Partial<MutationCtx>): MutationCtx => {
  const db = {
    query: vi.fn().mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        first: vi.fn(),
        unique: vi.fn(),
        collect: vi.fn(),
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

// Mock usage document
const createMockUsage = (overrides?: Partial<Doc<"usage">>): Doc<"usage"> => {
  const now = Date.now();
  return {
    _id: "usage_1" as Id<"usage">,
    _creationTime: now,
    accountId: "account_1" as Id<"accounts">,
    planId: ACCOUNT_PLAN.FREE,
    messagesThisMonth: 100,
    messagesMonthStart: now - RESET_CYCLES.MONTHLY / 2, // mid-cycle
    apiCallsToday: 10,
    apiCallsDayStart: now - RESET_CYCLES.DAILY / 2, // mid-cycle
    agentCount: 0,
    containerCount: 0,
    resetCycle: "monthly",
    lastReset: now - 1000000,
    updatedAt: now,
    ...overrides,
  };
};

// Mock account document
const createMockAccount = (
  overrides?: Partial<Doc<"accounts">>,
): Doc<"accounts"> => {
  const now = Date.now();
  return {
    _id: "account_1" as Id<"accounts">,
    _creationTime: now,
    owner: "user_1" as Id<"users">,
    name: "Test Account",
    plan: ACCOUNT_PLAN.FREE,
    status: "active",
    settings: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

describe("quotaHelpers", () => {
  describe("getPlanQuota", () => {
    test("should return quota for free plan", () => {
      const quota = getPlanQuota(ACCOUNT_PLAN.FREE);
      expect(quota.messagesPerMonth).toBe(500);
      expect(quota.agents).toBe(1);
      expect(quota.apiCallsPerDay).toBe(50);
      expect(quota.maxContainers).toBe(1);
    });

    test("should return quota for pro plan", () => {
      const quota = getPlanQuota(ACCOUNT_PLAN.PRO);
      expect(quota.messagesPerMonth).toBe(10000);
      expect(quota.agents).toBe(10);
      expect(quota.apiCallsPerDay).toBe(1000);
      expect(quota.maxContainers).toBe(5);
    });

    test("should return quota for enterprise plan", () => {
      const quota = getPlanQuota(ACCOUNT_PLAN.ENTERPRISE);
      expect(quota.messagesPerMonth).toBeGreaterThan(100000);
      expect(quota.agents).toBe(Number.MAX_SAFE_INTEGER);
    });

    test("should throw for invalid plan", () => {
      expect(() => getPlanQuota("invalid_plan")).toThrow(
        "Invalid plan: invalid_plan",
      );
    });
  });

  describe("checkQuota", () => {
    test("should allow message when under limit", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        messagesThisMonth: 100,
      });
      const account = createMockAccount({ plan: ACCOUNT_PLAN.FREE });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.get as any).mockResolvedValue(account);

      const result = await checkQuota(
        ctx,
        "account_1" as Id<"accounts">,
        "messages",
      );

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(100);
      expect(result.limit).toBe(500);
      expect(result.remaining).toBe(400);
    });

    test("should deny message when at quota limit", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        messagesThisMonth: 500,
      });
      const account = createMockAccount({ plan: ACCOUNT_PLAN.FREE });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.get as any).mockResolvedValue(account);

      const result = await checkQuota(
        ctx,
        "account_1" as Id<"accounts">,
        "messages",
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("should reset monthly counter if 30+ days elapsed", async () => {
      const ctx = createMockCtx();
      const now = Date.now();
      const usage = createMockUsage({
        messagesThisMonth: 500,
        messagesMonthStart: now - RESET_CYCLES.MONTHLY - 1000, // Over 30 days ago
      });
      const account = createMockAccount({ plan: ACCOUNT_PLAN.FREE });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.get as any).mockResolvedValue(account);
      (ctx.db.patch as any).mockResolvedValue(null);

      const result = await checkQuota(
        ctx,
        "account_1" as Id<"accounts">,
        "messages",
      );

      expect(result.current).toBe(0);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(500);
    });

    test("should reset daily counter if 24+ hours elapsed", async () => {
      const ctx = createMockCtx();
      const now = Date.now();
      const usage = createMockUsage({
        apiCallsToday: 50,
        apiCallsDayStart: now - RESET_CYCLES.DAILY - 1000, // Over 24 hours ago
      });
      const account = createMockAccount({ plan: ACCOUNT_PLAN.FREE });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.get as any).mockResolvedValue(account);

      const result = await checkQuota(
        ctx,
        "account_1" as Id<"accounts">,
        "apiCalls",
      );

      expect(result.current).toBe(0);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50);
    });

    test("should check agent quota correctly", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        agentCount: 1,
      });
      const account = createMockAccount({ plan: ACCOUNT_PLAN.FREE });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.get as any).mockResolvedValue(account);

      const result = await checkQuota(
        ctx,
        "account_1" as Id<"accounts">,
        "agents",
      );

      expect(result.allowed).toBe(false); // At limit for free plan
      expect(result.current).toBe(1);
      expect(result.limit).toBe(1);
    });

    test("should check container quota correctly", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        containerCount: 0,
      });
      const account = createMockAccount({ plan: ACCOUNT_PLAN.PRO });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.get as any).mockResolvedValue(account);

      const result = await checkQuota(
        ctx,
        "account_1" as Id<"accounts">,
        "containers",
      );

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(5); // Pro plan limit
    });

    test("should throw if usage record not found", async () => {
      const ctx = createMockCtx();
      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(null);

      await expect(
        checkQuota(ctx, "account_1" as Id<"accounts">, "messages"),
      ).rejects.toThrow("Usage record not found");
    });

    test("should throw if account not found", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage();
      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.get as any).mockResolvedValue(null);

      await expect(
        checkQuota(ctx, "account_1" as Id<"accounts">, "messages"),
      ).rejects.toThrow("Account not found");
    });

    test("should throw for unknown quota type", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage();
      const account = createMockAccount();

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.get as any).mockResolvedValue(account);

      await expect(
        checkQuota(ctx, "account_1" as Id<"accounts">, "invalid" as any),
      ).rejects.toThrow("Unknown quota type");
    });
  });

  describe("incrementUsage", () => {
    test("should increment message count", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        messagesThisMonth: 100,
      });
      const now = Date.now();
      usage._creationTime = now;

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await incrementUsage(ctx, "account_1" as Id<"accounts">, "messages");

      expect(ctx.db.patch).toHaveBeenCalled();
      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].messagesThisMonth).toBe(101);
    });

    test("should reset monthly counter and set to 1 if window elapsed", async () => {
      const ctx = createMockCtx();
      const now = Date.now();
      const usage = createMockUsage({
        messagesThisMonth: 500,
        messagesMonthStart: now - RESET_CYCLES.MONTHLY - 1000,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await incrementUsage(ctx, "account_1" as Id<"accounts">, "messages");

      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].messagesThisMonth).toBe(1);
      expect(typeof patchCall[1].messagesMonthStart).toBe("number");
    });

    test("should increment API call count", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        apiCallsToday: 10,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await incrementUsage(ctx, "account_1" as Id<"accounts">, "apiCalls");

      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].apiCallsToday).toBe(11);
    });

    test("should increment agent count", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        agentCount: 0,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await incrementUsage(ctx, "account_1" as Id<"accounts">, "agents");

      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].agentCount).toBe(1);
    });

    test("should increment container count", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        containerCount: 2,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await incrementUsage(ctx, "account_1" as Id<"accounts">, "containers");

      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].containerCount).toBe(3);
    });
  });

  describe("decrementUsage", () => {
    test("should decrement agent count", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        agentCount: 2,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await decrementUsage(ctx, "account_1" as Id<"accounts">, "agents");

      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].agentCount).toBe(1);
    });

    test("should decrement container count", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        containerCount: 3,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await decrementUsage(
        ctx,
        "account_1" as Id<"accounts">,
        "containers",
      );

      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].containerCount).toBe(2);
    });

    test("should not go below 0 for agent count", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage({
        agentCount: 0,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await decrementUsage(ctx, "account_1" as Id<"accounts">, "agents");

      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].agentCount).toBe(0);
    });
  });

  describe("initializeAccountUsage", () => {
    test("should create usage record with free plan defaults", async () => {
      const ctx = createMockCtx();
      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(null);
      (ctx.db.insert as any).mockResolvedValue("usage_123" as Id<"usage">);

      const result = await initializeAccountUsage(
        ctx,
        "account_1" as Id<"accounts">,
      );

      expect(result).toBe("usage_123");
      expect(ctx.db.insert).toHaveBeenCalled();
      const insertCall = (ctx.db.insert as any).mock.calls[0];
      expect(insertCall[0]).toBe("usage");
      expect(insertCall[1].accountId).toBe("account_1");
      expect(insertCall[1].planId).toBe(ACCOUNT_PLAN.FREE);
      expect(insertCall[1].messagesThisMonth).toBe(0);
      expect(insertCall[1].agentCount).toBe(0);
    });

    test("should return existing usage record if present", async () => {
      const ctx = createMockCtx();
      const usage = createMockUsage();
      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);

      const result = await initializeAccountUsage(
        ctx,
        "account_1" as Id<"accounts">,
      );

      expect(result).toBe(usage._id);
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    test("should create with custom plan", async () => {
      const ctx = createMockCtx();
      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(null);
      (ctx.db.insert as any).mockResolvedValue("usage_123" as Id<"usage">);

      await initializeAccountUsage(
        ctx,
        "account_1" as Id<"accounts">,
        ACCOUNT_PLAN.PRO,
      );

      const insertCall = (ctx.db.insert as any).mock.calls[0];
      expect(insertCall[1].planId).toBe(ACCOUNT_PLAN.PRO);
    });
  });

  describe("resetMonthlyQuota", () => {
    test("should reset monthly quota when window elapsed", async () => {
      const ctx = createMockCtx();
      const now = Date.now();
      const usage = createMockUsage({
        messagesThisMonth: 500,
        messagesMonthStart: now - RESET_CYCLES.MONTHLY - 1000,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await resetMonthlyQuota(ctx, "account_1" as Id<"accounts">);

      expect(ctx.db.patch).toHaveBeenCalled();
      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].messagesThisMonth).toBe(0);
      expect(typeof patchCall[1].messagesMonthStart).toBe("number");
    });

    test("should not reset monthly quota if window not elapsed", async () => {
      const ctx = createMockCtx();
      const now = Date.now();
      const usage = createMockUsage({
        messagesThisMonth: 100,
        messagesMonthStart: now - RESET_CYCLES.MONTHLY / 2,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await resetMonthlyQuota(ctx, "account_1" as Id<"accounts">);

      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    test("should be idempotent (skip if no usage record)", async () => {
      const ctx = createMockCtx();
      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(null);

      await resetMonthlyQuota(ctx, "account_1" as Id<"accounts">);

      expect(ctx.db.patch).not.toHaveBeenCalled();
    });
  });

  describe("resetDailyQuota", () => {
    test("should reset daily quota when window elapsed", async () => {
      const ctx = createMockCtx();
      const now = Date.now();
      const usage = createMockUsage({
        apiCallsToday: 50,
        apiCallsDayStart: now - RESET_CYCLES.DAILY - 1000,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await resetDailyQuota(ctx, "account_1" as Id<"accounts">);

      expect(ctx.db.patch).toHaveBeenCalled();
      const patchCall = (ctx.db.patch as any).mock.calls[0];
      expect(patchCall[1].apiCallsToday).toBe(0);
      expect(typeof patchCall[1].apiCallsDayStart).toBe("number");
    });

    test("should not reset daily quota if window not elapsed", async () => {
      const ctx = createMockCtx();
      const now = Date.now();
      const usage = createMockUsage({
        apiCallsToday: 10,
        apiCallsDayStart: now - RESET_CYCLES.DAILY / 2,
      });

      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
      (ctx.db.patch as any).mockResolvedValue(null);

      await resetDailyQuota(ctx, "account_1" as Id<"accounts">);

      expect(ctx.db.patch).not.toHaveBeenCalled();
    });

    test("should be idempotent (skip if no usage record)", async () => {
      const ctx = createMockCtx();
      (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(null);

      await resetDailyQuota(ctx, "account_1" as Id<"accounts">);

      expect(ctx.db.patch).not.toHaveBeenCalled();
    });
  });
});
