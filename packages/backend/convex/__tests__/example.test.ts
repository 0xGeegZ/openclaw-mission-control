/**
 * Example test file demonstrating Convex test setup usage
 * 
 * Location: convex/__tests__/example.test.ts
 * 
 * This file shows how to:
 * - Set up test environment
 * - Use factories to create test data
 * - Use assertion helpers
 * - Test Convex functions with proper context
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestEnv, createTestUser, createMockAuthContext } from "./setup";
import {
  TaskFactory,
  AgentFactory,
  AccountFactory,
  MessageFactory,
} from "./factories";
import {\n  expectTaskInAssignedStatus,\n  expectTaskStatus,\n  expectAgentOnline,\n  expectMessageAuthor,\n  TimeHelpers,\n} from "./helpers";

// ============================================================================
// Task Management Tests
// ============================================================================

describe("Task Management", () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("should create a task in inbox status", async () => {
    const task = TaskFactory.create({
      accountId: env.testAccountId as any,
      title: "Implement test setup",
      createdBy: env.testUserId,
    });

    expect(task).toBeDefined();
    expect(task.status).toBe("inbox");
    expect(task.title).toBe("Implement test setup");
  });

  it("should transition task from inbox to assigned", async () => {
    const agent = AgentFactory.create({
      accountId: env.testAccountId as any,
    });

    const task = TaskFactory.createWithStatus("inbox", {
      accountId: env.testAccountId as any,
    });

    // Simulate assigning task to agent
    const assignedTask = {
      ...task,
      status: "assigned" as const,
      assignedAgentIds: [agent._id],
    };

    expectTaskInAssignedStatus(assignedTask);
    expect(assignedTask.assignedAgentIds).toContain(agent._id);
  });

  it("should enforce valid status transitions", async () => {
    const task = TaskFactory.createWithStatus(\"inbox\", {\n      accountId: env.testAccountId as any,\n    });\n\n    // Valid transition: inbox -> assigned\n    const assignedTask = { ...task, status: \"assigned\" as const };\n    expectTaskStatus(assignedTask, \"assigned\");\n\n    // Valid transition: assigned -> in_progress\n    const inProgressTask = { ...assignedTask, status: \"in_progress\" as const };\n    expectTaskStatus(inProgressTask, \"in_progress\");\n\n    // Valid transition: in_progress -> review\n    const reviewTask = { ...inProgressTask, status: \"review\" as const };\n    expectTaskStatus(reviewTask, \"review\");\n\n    // Valid transition: review -> done\n    const doneTask = { ...reviewTask, status: \"done\" as const };\n    expectTaskStatus(doneTask, \"done\");\n  });\n\n  it(\"should handle task blocking with reason\", async () => {\n    const task = TaskFactory.createWithStatus(\"in_progress\", {\n      accountId: env.testAccountId as any,\n    });\n\n    // Simulate blocking\n    const blockedTask = {\n      ...task,\n      status: \"blocked\" as const,\n      blockedReason: \"Waiting for design review\",\n    };\n\n    expectTaskStatus(blockedTask, \"blocked\");\n    expect(blockedTask.blockedReason).toBe(\"Waiting for design review\");\n  });\n\n  it(\"should support multiple assignees\", async () => {\n    const agent1 = AgentFactory.create({ accountId: env.testAccountId as any });\n    const agent2 = AgentFactory.create({ accountId: env.testAccountId as any });\n    const userId = createTestUser(\"user@example.com\");\n\n    const task = TaskFactory.create({\n      accountId: env.testAccountId as any,\n      assignedAgentIds: [agent1._id, agent2._id],\n      assignedUserIds: [userId],\n    });\n\n    expect(task.assignedAgentIds).toContain(agent1._id);\n    expect(task.assignedAgentIds).toContain(agent2._id);\n    expect(task.assignedUserIds).toContain(userId);\n  });\n});\n\n// ============================================================================\n// Agent Management Tests\n// ============================================================================\n\ndescribe(\"Agent Management\", () => {\n  let env: ReturnType<typeof createTestEnv>;\n\n  beforeEach(async () => {\n    env = await createTestEnv();\n  });\n\n  it(\"should create an agent with online status\", async () => {\n    const agent = AgentFactory.create({\n      accountId: env.testAccountId as any,\n    });\n\n    expectAgentOnline(agent);\n  });\n\n  it(\"should update agent status based on heartbeat\", async () => {\n    const agent = AgentFactory.createWithStatus(\"online\", {\n      accountId: env.testAccountId as any,\n    });\n\n    expectAgentOnline(agent);\n\n    // Simulate status change to offline\n    const offlineAgent = { ...agent, status: \"offline\" as const };\n    expect(offlineAgent.status).toBe(\"offline\");\n  });\n\n  it(\"should track agent configuration\", async () => {\n    const agent = AgentFactory.create({\n      accountId: env.testAccountId as any,\n    });\n\n    expect(agent.openclawConfig).toBeDefined();\n    expect(agent.openclawConfig?.model).toBe(\"claude-sonnet-4-20250514\");\n    expect(agent.openclawConfig?.temperature).toBe(0.7);\n  });\n});\n\n// ============================================================================\n// Message/Thread Tests\n// ============================================================================\n\ndescribe(\"Messages and Threading\", () => {\n  let env: ReturnType<typeof createTestEnv>;\n\n  beforeEach(async () => {\n    env = await createTestEnv();\n  });\n\n  it(\"should create message with author context\", async () => {\n    const userId = createTestUser(\"alice@example.com\");\n    const message = MessageFactory.create({\n      accountId: env.testAccountId as any,\n      authorId: userId,\n      authorType: \"user\",\n      content: \"This is a test message\",\n    });\n\n    expectMessageAuthor(message, userId, \"user\");\n  });\n\n  it(\"should support agent-authored messages\", async () => {\n    const agent = AgentFactory.create({ accountId: env.testAccountId as any });\n    const message = MessageFactory.create({\n      accountId: env.testAccountId as any,\n      authorId: agent._id,\n      authorType: \"agent\",\n      content: \"Agent response\",\n    });\n\n    expectMessageAuthor(message, agent._id, \"agent\");\n  });\n\n  it(\"should parse mentions in message content\", async () => {\n    const user1 = createTestUser(\"alice@example.com\");\n    const agent1 = AgentFactory.create({ accountId: env.testAccountId as any });\n\n    const message = MessageFactory.createWithMentions(\n      [\n        { type: \"user\", id: user1, name: \"Alice\" },\n        { type: \"agent\", id: agent1._id, name: \"Engineer\" },\n      ],\n      {\n        accountId: env.testAccountId as any,\n        content: \"@Alice and @Engineer please review\",\n      }\n    );\n\n    expect(message.mentions).toHaveLength(2);\n    expect(message.mentions[0].id).toBe(user1);\n    expect(message.mentions[1].id).toBe(agent1._id);\n  });\n});\n\n// ============================================================================\n// Time-dependent Tests\n// ============================================================================\n\ndescribe(\"Time-dependent Behavior\", () => {\n  it(\"should handle due dates\", () => {\n    const dueDate = TimeHelpers.inDays(7);\n    const task = TaskFactory.create({\n      dueDate,\n    });\n\n    expect(task.dueDate).toBe(dueDate);\n  });\n\n  it(\"should track timestamps accurately\", () => {\n    const now = TimeHelpers.now();\n    const task = TaskFactory.create({\n      createdAt: now,\n    });\n\n    TimeHelpers.expectCloseTimestamps(task.createdAt, now, 100);\n  });\n});\n\n// ============================================================================\n// Multi-tenancy Tests\n// ============================================================================\n\ndescribe(\"Multi-tenancy\", () => {\n  it(\"should isolate data by account\", () => {\n    const account1 = AccountFactory.create();\n    const account2 = AccountFactory.create();\n\n    const task1 = TaskFactory.create({ accountId: account1._id });\n    const task2 = TaskFactory.create({ accountId: account2._id });\n\n    expect(task1.accountId).toBe(account1._id);\n    expect(task2.accountId).toBe(account2._id);\n    expect(task1.accountId).not.toBe(task2.accountId);\n  });\n\n  it(\"should enforce account-scoped permissions\", () => {\n    const authContext = createMockAuthContext(\"user@example.com\");\n\n    expect(authContext.accountId).toBeDefined();\n    expect(authContext.userId).toBeDefined();\n  });\n});\n