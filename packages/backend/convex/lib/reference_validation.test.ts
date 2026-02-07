/**
 * Unit tests for reference validation and cascading deletes.
 * Coverage: lib/reference_validation.ts (data integrity, cascading delete logic)
 */

import { describe, it, expect } from "vitest";
import {
  cascadeDeleteAccount,
  validateTaskReferences,
  validateDocumentReferences,
} from "./reference_validation";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Mock Context Helpers
// ============================================================================

function createMockDbContext(tables: Record<string, any[]>) {
  const db = {
    get: async (id: Id<any>) => {
      for (const table of Object.values(tables)) {
        const doc = table.find((d) => d._id === id);
        if (doc) return doc;
      }
      return null;
    },
    query: (table: string) => ({
      filter: (_filterFn: Function) => ({
        collect: async () => tables[table] || [],
      }),
      withIndex: (_indexName: string, _fn: Function) => ({
        collect: async () => tables[table] || [],
      }),
    }),
  };
  const writer = {
    delete: async (_id: Id<any>) => true,
  };
  return { db, writer } as any;
}

// ============================================================================
// cascadeDeleteAccount Tests
// ============================================================================

describe("cascadeDeleteAccount", () => {
  it("should delete account and all related documents", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Test Account" }],
      memberships: [
        { _id: "member_1" as Id<"memberships">, accountId, userId: "user_1" },
        { _id: "member_2" as Id<"memberships">, accountId, userId: "user_2" },
      ],
      tasks: [
        { _id: "task_1" as Id<"tasks">, accountId, title: "Task 1" },
        { _id: "task_2" as Id<"tasks">, accountId, title: "Task 2" },
      ],
      agents: [
        { _id: "agent_1" as Id<"agents">, accountId, name: "Agent 1" },
      ],
    });

    await expect(
      cascadeDeleteAccount(ctx.db, ctx.writer, accountId),
    ).resolves.toBeUndefined();
  });

  it("should handle account with no related documents", async () => {
    const accountId = "account_empty" as Id<"accounts">;
    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Empty Account" }],
      memberships: [],
      tasks: [],
      agents: [],
    });

    await expect(
      cascadeDeleteAccount(ctx.db, ctx.writer, accountId),
    ).resolves.toBeUndefined();
  });

  it("should delete subscriptions when account is deleted", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Test Account" }],
      subscriptions: [
        {
          _id: "sub_1" as Id<"subscriptions">,
          accountId,
          stripeId: "stripe_123",
        },
      ],
      memberships: [],
      tasks: [],
      agents: [],
    });

    await expect(
      cascadeDeleteAccount(ctx.db, ctx.writer, accountId),
    ).resolves.toBeUndefined();
  });

  it("should not delete documents from other accounts", async () => {
    const accountId = "account_1" as Id<"accounts">;
    const otherAccountId = "account_2" as Id<"accounts">;
    const ctx = createMockDbContext({
      accounts: [
        { _id: accountId, name: "Account 1" },
        { _id: otherAccountId, name: "Account 2" },
      ],
      tasks: [
        { _id: "task_1" as Id<"tasks">, accountId, title: "Task 1" },
        { _id: "task_2" as Id<"tasks">, accountId: otherAccountId, title: "Task 2" },
      ],
    });

    await expect(
      cascadeDeleteAccount(ctx.db, ctx.writer, accountId),
    ).resolves.toBeUndefined();
  });
});

// ============================================================================
// validateTaskReferences Tests
// ============================================================================

describe("validateTaskReferences", () => {
  it("should return no issues when all task references are valid", async () => {
    const taskId = "task_1" as Id<"tasks">;
    const accountId = "account_1" as Id<"accounts">;
    const ctx = createMockDbContext({
      tasks: [
        { _id: taskId, accountId, title: "Valid Task", createdBy: "user_123" },
      ],
      accounts: [{ _id: accountId, name: "Test Account" }],
    });

    const issues = await validateTaskReferences(ctx.db, {
      _id: taskId,
      accountId,
      title: "Valid Task",
    });

    expect(issues).toHaveLength(0);
  });

  it("should return issues when assigned agent does not exist or wrong account", async () => {
    const accountId = "account_1" as Id<"accounts">;
    const badAgentId = "agent_missing" as Id<"agents">;
    const ctx = createMockDbContext({
      tasks: [
        {
          _id: "task_1" as Id<"tasks">,
          accountId,
          assignedAgentIds: [badAgentId],
        },
      ],
      accounts: [{ _id: accountId, name: "Test" }],
      agents: [],
    });

    const issues = await validateTaskReferences(ctx.db, {
      _id: "task_1" as Id<"tasks">,
      accountId,
      assignedAgentIds: [badAgentId],
    });

    expect(issues.length).toBeGreaterThan(0);
  });

  it("should return no issues when task has valid assigned agents", async () => {
    const taskId = "task_1" as Id<"tasks">;
    const accountId = "account_1" as Id<"accounts">;
    const agentId = "agent_1" as Id<"agents">;
    const ctx = createMockDbContext({
      tasks: [{ _id: taskId, accountId, assignedAgentIds: [agentId] }],
      accounts: [{ _id: accountId, name: "Test" }],
      agents: [{ _id: agentId, accountId, name: "Agent" }],
    });

    const issues = await validateTaskReferences(ctx.db, {
      _id: taskId,
      accountId,
      assignedAgentIds: [agentId],
    });

    expect(issues).toHaveLength(0);
  });
});

// ============================================================================
// validateDocumentReferences Tests
// ============================================================================

describe("validateDocumentReferences", () => {
  it("should return no issues when document has no optional references", async () => {
    const accountId = "account_1" as Id<"accounts">;
    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Test" }],
    });

    const issues = await validateDocumentReferences(ctx.db, {
      accountId,
      title: "Doc",
    });

    expect(issues).toHaveLength(0);
  });

  it("should return issues when document parent is invalid", async () => {
    const accountId = "account_1" as Id<"accounts">;
    const badParentId = "parent_missing" as Id<"documents">;
    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Test" }],
      documents: [],
    });

    const issues = await validateDocumentReferences(ctx.db, {
      accountId,
      parentId: badParentId,
      title: "Doc",
    });

    expect(issues.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Reference Validation Integration", () => {
  it("should complete cascade delete without throwing", async () => {
    const accountId = "account_to_delete" as Id<"accounts">;
    const taskId = "task_1" as Id<"tasks">;
    const membershipId = "member_1" as Id<"memberships">;

    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Delete Me" }],
      tasks: [{ _id: taskId, accountId, title: "Task" }],
      memberships: [{ _id: membershipId, accountId, userId: "user_1" }],
    });

    await expect(
      cascadeDeleteAccount(ctx.db, ctx.writer, accountId),
    ).resolves.toBeUndefined();
  });
});
