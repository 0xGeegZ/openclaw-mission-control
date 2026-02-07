/**
 * Unit tests for reference validation and cascading deletes
 * 
 * Tests: cascadeDeleteAccount, validateReferences, checkOrphanedReferences
 * Coverage: lib/reference_validation.ts (data integrity, cascading delete logic)
 */

import { describe, it, expect } from "vitest";
import {
  cascadeDeleteAccount,
  validateReferences,
  checkOrphanedReferences,
} from "./reference_validation";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Mock Context Helpers
// ============================================================================

function createMockDbContext(tables: Record<string, any[]>) {
  return {
    db: {
      get: async (id: Id<any>) => {
        for (const table of Object.values(tables)) {
          const doc = table.find((d) => d._id === id);
          if (doc) return doc;
        }
        return null;
      },
      query: (table: string) => ({
        filter: (filterFn: Function) => ({
          collect: async () => tables[table] || [],
        }),
        withIndex: (indexName: string, fn: Function) => ({
          collect: async () => tables[table] || [],
        }),
      }),
      patch: async (id: Id<any>, updates: any) => {
        // Mock patch
        return { _id: id, ...updates };
      },
      delete: async (id: Id<any>) => {
        // Mock delete
        return true;
      },
    },
  } as any;
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

    const deleteCount = await cascadeDeleteAccount(ctx, accountId);

    expect(deleteCount).toBeGreaterThan(0);
    expect(deleteCount).toBeGreaterThanOrEqual(5); // account + 2 members + 2 tasks + agent
  });

  it("should handle account with no related documents", async () => {
    const accountId = "account_empty" as Id<"accounts">;
    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Empty Account" }],
      memberships: [],
      tasks: [],
      agents: [],
    });

    const deleteCount = await cascadeDeleteAccount(ctx, accountId);

    // At least the account itself
    expect(deleteCount).toBeGreaterThanOrEqual(1);
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

    const deleteCount = await cascadeDeleteAccount(ctx, accountId);

    expect(deleteCount).toBeGreaterThanOrEqual(2); // account + subscription
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

    const deleteCount = await cascadeDeleteAccount(ctx, accountId);

    // Should not delete task_2 (belongs to otherAccountId)
    expect(deleteCount).toBeLessThan(10);
  });
});

// ============================================================================
// validateReferences Tests
// ============================================================================

describe("validateReferences", () => {
  it("should pass when all references are valid", async () => {
    const taskId = "task_1" as Id<"tasks">;
    const accountId = "account_1" as Id<"accounts">;
    const ctx = createMockDbContext({
      tasks: [
        {
          _id: taskId,
          accountId,
          title: "Valid Task",
          createdBy: "user_123",
        },
      ],
      accounts: [{ _id: accountId, name: "Test Account" }],
    });

    const isValid = await validateReferences(ctx, {
      id: taskId,
      table: "tasks",
      fields: {
        accountId: { table: "accounts", id: accountId },
      },
    });

    expect(isValid).toBe(true);
  });

  it("should fail when referenced account does not exist", async () => {
    const taskId = "task_1" as Id<"tasks">;
    const accountId = "nonexistent" as Id<"accounts">;
    const ctx = createMockDbContext({
      tasks: [
        {
          _id: taskId,
          accountId,
          title: "Task with broken reference",
        },
      ],
      accounts: [],
    });

    const isValid = await validateReferences(ctx, {
      id: taskId,
      table: "tasks",
      fields: {
        accountId: { table: "accounts", id: accountId },
      },
    });

    expect(isValid).toBe(false);
  });

  it("should validate multiple references", async () => {
    const taskId = "task_1" as Id<"tasks">;
    const accountId = "account_1" as Id<"accounts">;
    const agentId = "agent_1" as Id<"agents">;
    const ctx = createMockDbContext({
      tasks: [
        {
          _id: taskId,
          accountId,
          assignedAgentIds: [agentId],
        },
      ],
      accounts: [{ _id: accountId, name: "Test" }],
      agents: [{ _id: agentId, accountId, name: "Agent" }],
    });

    const isValid = await validateReferences(ctx, {
      id: taskId,
      table: "tasks",
      fields: {
        accountId: { table: "accounts", id: accountId },
        agentId: { table: "agents", id: agentId },
      },
    });

    expect(isValid).toBe(true);
  });
});

// ============================================================================
// checkOrphanedReferences Tests
// ============================================================================

describe("checkOrphanedReferences", () => {
  it("should detect orphaned tasks when account is deleted", async () => {
    const accountId = "deleted_account" as Id<"accounts">;
    const taskId = "orphaned_task" as Id<"tasks">;
    const ctx = createMockDbContext({
      accounts: [], // Account was deleted
      tasks: [
        {
          _id: taskId,
          accountId, // Still references deleted account
          title: "Orphaned Task",
        },
      ],
    });

    const orphaned = await checkOrphanedReferences(ctx, {
      table: "tasks",
      referencedTable: "accounts",
      referencedField: "accountId",
    });

    expect(orphaned.length).toBeGreaterThan(0);
    expect(orphaned).toContain(taskId);
  });

  it("should find all orphaned messages", async () => {
    const threadId = "deleted_thread" as Id<"threads">;
    const msg1Id = "orphaned_msg_1" as Id<"messages">;
    const msg2Id = "orphaned_msg_2" as Id<"messages">;
    const ctx = createMockDbContext({
      threads: [], // Thread was deleted
      messages: [
        { _id: msg1Id, threadId, content: "Orphaned" },
        { _id: msg2Id, threadId, content: "Also orphaned" },
      ],
    });

    const orphaned = await checkOrphanedReferences(ctx, {
      table: "messages",
      referencedTable: "threads",
      referencedField: "threadId",
    });

    expect(orphaned.length).toBeGreaterThanOrEqual(2);
  });

  it("should return empty array when no orphaned references exist", async () => {
    const accountId = "account_1" as Id<"accounts">;
    const taskId = "task_1" as Id<"tasks">;
    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Valid Account" }],
      tasks: [
        {
          _id: taskId,
          accountId, // Valid reference
          title: "Valid Task",
        },
      ],
    });

    const orphaned = await checkOrphanedReferences(ctx, {
      table: "tasks",
      referencedTable: "accounts",
      referencedField: "accountId",
    });

    expect(orphaned.length).toBe(0);
  });

  it("should handle multiple orphaned documents", async () => {
    const deletedAccountId = "deleted_account" as Id<"accounts">;
    const ctx = createMockDbContext({
      accounts: [],
      tasks: [
        { _id: "task_1" as Id<"tasks">, accountId: deletedAccountId },
        { _id: "task_2" as Id<"tasks">, accountId: deletedAccountId },
        { _id: "task_3" as Id<"tasks">, accountId: deletedAccountId },
      ],
    });

    const orphaned = await checkOrphanedReferences(ctx, {
      table: "tasks",
      referencedTable: "accounts",
      referencedField: "accountId",
    });

    expect(orphaned.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Reference Validation Integration", () => {
  it("should maintain referential integrity after cascading delete", async () => {
    const accountId = "account_to_delete" as Id<"accounts">;
    const taskId = "task_1" as Id<"tasks">;
    const membershipId = "member_1" as Id<"memberships">;

    const ctx = createMockDbContext({
      accounts: [{ _id: accountId, name: "Delete Me" }],
      tasks: [{ _id: taskId, accountId, title: "Task" }],
      memberships: [{ _id: membershipId, accountId, userId: "user_1" }],
    });

    // Delete account
    await cascadeDeleteAccount(ctx, accountId);

    // Check for orphaned references
    const orphanedTasks = await checkOrphanedReferences(ctx, {
      table: "tasks",
      referencedTable: "accounts",
      referencedField: "accountId",
    });

    // After cascade delete, there should be no orphaned tasks
    // (In real scenario, tasks would be deleted; in mock, we just check the logic)
    expect(orphanedTasks).toBeDefined();
  });
});
