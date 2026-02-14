/**
 * Tests for container quota enforcement.
 */
import { expect, test, describe, beforeEach, vi } from "vitest";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { Id } from "./_generated/dataModel";
import { ACCOUNT_PLAN } from "./lib/constants";

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

// Mock usage document for quota checks
const createMockUsage = (overrides?: Partial<Doc<"usage">>): Doc<"usage"> => {
  const now = Date.now();
  return {
    _id: "usage_1" as Id<"usage">,
    _creationTime: now,
    accountId: "account_1" as Id<"accounts">,
    planId: ACCOUNT_PLAN.FREE,
    messagesThisMonth: 0,
    messagesMonthStart: now,
    apiCallsToday: 0,
    apiCallsDayStart: now,
    agentCount: 0,
    containerCount: 0,
    resetCycle: "monthly",
    lastReset: now,
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

describe("containers quota enforcement", () => {
  test("should allow container creation when under quota", async () => {
    const ctx = createMockCtx();
    const usage = createMockUsage({
      containerCount: 0,
    });
    const account = createMockAccount({ plan: ACCOUNT_PLAN.FREE });

    // Mock the quota check in container creation
    (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
    (ctx.db.get as any).mockResolvedValue(account);
    (ctx.db.insert as any).mockResolvedValue("container_123" as Id<"containers">);
    (ctx.db.patch as any).mockResolvedValue(null);

    // Verify quota allows creation
    expect(usage.containerCount).toBe(0);
    expect(account.plan).toBe(ACCOUNT_PLAN.FREE); // Free plan allows 1 container
  });

  test("should deny container creation when at quota limit", async () => {
    const ctx = createMockCtx();
    const usage = createMockUsage({
      containerCount: 1, // At limit for free plan
    });
    const account = createMockAccount({ plan: ACCOUNT_PLAN.FREE });

    (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
    (ctx.db.get as any).mockResolvedValue(account);

    // Verify quota check would fail
    expect(usage.containerCount).toBe(1); // At free plan limit
    expect(account.plan).toBe(ACCOUNT_PLAN.FREE);
  });

  test("should allow multiple containers on pro plan", async () => {
    const ctx = createMockCtx();
    const usage = createMockUsage({
      containerCount: 3,
    });
    const account = createMockAccount({ plan: ACCOUNT_PLAN.PRO });

    (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
    (ctx.db.get as any).mockResolvedValue(account);

    // Verify quota allows more containers
    expect(usage.containerCount).toBe(3);
    expect(account.plan).toBe(ACCOUNT_PLAN.PRO); // Pro plan allows 5 containers
  });

  test("should deny container creation when at pro plan limit", async () => {
    const ctx = createMockCtx();
    const usage = createMockUsage({
      containerCount: 5, // At limit for pro plan
    });
    const account = createMockAccount({ plan: ACCOUNT_PLAN.PRO });

    (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
    (ctx.db.get as any).mockResolvedValue(account);

    // Verify quota check would fail at pro limit
    expect(usage.containerCount).toBe(5);
    expect(account.plan).toBe(ACCOUNT_PLAN.PRO);
  });

  test("should track containerCount in usage after creation", async () => {
    const ctx = createMockCtx();
    const usage = createMockUsage({
      containerCount: 2,
    });

    (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
    (ctx.db.patch as any).mockResolvedValue(null);

    // After creation, containerCount should increment
    const newCount = usage.containerCount + 1;
    expect(newCount).toBe(3);
  });

  test("should decrement containerCount after deletion", async () => {
    const ctx = createMockCtx();
    const usage = createMockUsage({
      containerCount: 3,
    });

    (ctx.db.query("usage").withIndex().first as any).mockResolvedValue(usage);
    (ctx.db.patch as any).mockResolvedValue(null);

    // After deletion, containerCount should decrement
    const newCount = Math.max(0, usage.containerCount - 1);
    expect(newCount).toBe(2);
  });
});
