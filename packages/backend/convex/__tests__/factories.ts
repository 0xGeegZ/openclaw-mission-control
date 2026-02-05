/**
 * convex/__tests__/factories.ts — Test Data Factories
 * 
 * Object factories for creating consistent test data.
 * Follows the Factory pattern for test data generation.
 * 
 * Example:
 * ```
 * const task = TaskFactory.create({
 *   accountId,
 *   title: "Custom title",
 * });
 * ```
 */

import type { DataModel } from "../_generated/dataModel";

// ============================================================================
// Type Aliases (for clarity)
// ============================================================================

type Account = DataModel["accounts"]["document"];
type Membership = DataModel["memberships"]["document"];
type Agent = DataModel["agents"]["document"];
type Task = DataModel["tasks"]["document"];
type Message = DataModel["messages"]["document"];
type Document = DataModel["documents"]["document"];
type Activity = DataModel["activities"]["document"];
type Notification = DataModel["notifications"]["document"];
type Subscription = DataModel["subscriptions"]["document"];

// ============================================================================
// Account Factory
// ============================================================================

export class AccountFactory {
  static create(overrides?: Partial<Omit<Account, "_id" | "_creationTime">>): Account {
    const now = Date.now();
    return {
      _id: generateId("accounts"),
      _creationTime: now,
      name: "Test Account",
      slug: "test-account-" + Math.random().toString(36).substr(2, 9),
      plan: "pro",
      runtimeStatus: "online",
      runtimeConfig: {
        dropletId: "mock-droplet-" + Math.random().toString(36).substr(2, 6),
        ipAddress: "192.168.1." + Math.floor(Math.random() * 254 + 1),
        region: "us-east-1",
        lastHealthCheck: now,
        openclawVersion: "v1.0.0",
        runtimeServiceVersion: "v1.0.0",
      },
      createdAt: now,
      ...overrides,
    } as Account;
  }

  static createMany(count: number, overrides?: Partial<Account>): Account[] {
    return Array.from({ length: count }, (_, i) =>
      AccountFactory.create({ ...overrides })
    );
  }
}

// ============================================================================
// Membership Factory
// ============================================================================

export class MembershipFactory {
  static create(overrides?: Partial<Omit<Membership, "_id" | "_creationTime">>): Membership {
    const now = Date.now();
    return {
      _id: generateId("memberships"),
      _creationTime: now,
      accountId: generateId("accounts") as any,
      userId: "user_" + Math.random().toString(36).substr(2, 20),
      userName: "Test User",
      userEmail: "user@example.com",
      userAvatarUrl: "https://example.com/avatar.jpg",
      role: "member",
      joinedAt: now,
      ...overrides,
    } as Membership;
  }

  static createMany(count: number, overrides?: Partial<Membership>): Membership[] {
    return Array.from({ length: count }, () =>
      MembershipFactory.create(overrides)
    );
  }
}

// ============================================================================
// Agent Factory
// ============================================================================

export class AgentFactory {
  static create(overrides?: Partial<Omit<Agent, "_id" | "_creationTime">>): Agent {
    const now = Date.now();
    const slug = "agent-" + Math.random().toString(36).substr(2, 6);
    return {
      _id: generateId("agents"),
      _creationTime: now,
      accountId: generateId("accounts") as any,
      name: "Test Agent",
      slug,
      role: "Engineer",
      description: "A test agent for testing",
      sessionKey: `agent:${slug}:test-account`,
      status: "online",
      heartbeatInterval: 15,
      openclawConfig: {
        model: "claude-sonnet-4-20250514",
        temperature: 0.7,
        maxTokens: 4096,
        skillIds: [],
        contextConfig: {
          maxHistoryMessages: 10,
          includeTaskContext: true,
          includeTeamContext: true,
        },
        rateLimits: {
          requestsPerMinute: 60,
        },
        behaviorFlags: {
          canCreateTasks: true,
          canModifyTaskStatus: true,
          canCreateDocuments: true,
          canMentionAgents: true,
        },
      },
      createdAt: now,
      ...overrides,
    } as Agent;
  }

  static createMany(count: number, overrides?: Partial<Agent>): Agent[] {
    return Array.from({ length: count }, () =>
      AgentFactory.create(overrides)
    );
  }

  static createWithStatus(
    status: "online" | "busy" | "idle" | "offline" | "error",
    overrides?: Partial<Agent>
  ): Agent {
    return AgentFactory.create({ status, ...overrides });
  }
}

// ============================================================================
// Task Factory
// ============================================================================

export class TaskFactory {
  static create(overrides?: Partial<Omit<Task, "_id" | "_creationTime">>): Task {
    const now = Date.now();
    return {
      _id: generateId("tasks"),
      _creationTime: now,
      accountId: generateId("accounts") as any,
      title: "Test Task",
      description: "A test task description",
      status: "inbox",
      priority: 3,
      assignedUserIds: [],
      assignedAgentIds: [],
      labels: [],
      createdBy: "user_test",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as Task;
  }

  static createMany(count: number, overrides?: Partial<Task>): Task[] {
    return Array.from({ length: count }, () =>
      TaskFactory.create(overrides)
    );
  }

  static createWithStatus(
    status: "inbox" | "assigned" | "in_progress" | "review" | "done" | "blocked",
    overrides?: Partial<Task>
  ): Task {
    return TaskFactory.create({ status, ...overrides });
  }

  static createWithAssignee(
    assigneeId: string,
    type: "user" | "agent" = "agent",
    overrides?: Partial<Task>
  ): Task {
    const assignedAgentIds = type === "agent" ? [assigneeId as any] : [];
    const assignedUserIds = type === "user" ? [assigneeId] : [];
    return TaskFactory.create({
      status: "assigned",
      assignedAgentIds,
      assignedUserIds,
      ...overrides,
    });
  }
}

// ============================================================================
// Message Factory
// ============================================================================

export class MessageFactory {
  static create(overrides?: Partial<Omit<Message, "_id" | "_creationTime">>): Message {
    const now = Date.now();
    return {
      _id: generateId("messages"),
      _creationTime: now,
      accountId: generateId("accounts") as any,
      taskId: generateId("tasks") as any,
      authorType: "user",
      authorId: "user_test",
      content: "Test message content",
      mentions: [],
      createdAt: now,
      ...overrides,
    } as Message;
  }

  static createMany(count: number, overrides?: Partial<Message>): Message[] {
    return Array.from({ length: count }, () =>
      MessageFactory.create(overrides)
    );
  }

  static createWithMentions(
    mentions: Message["mentions"],
    overrides?: Partial<Message>
  ): Message {
    return MessageFactory.create({ mentions, ...overrides });
  }
}

// ============================================================================
// Document Factory
// ============================================================================

export class DocumentFactory {
  static create(overrides?: Partial<Omit<Document, "_id" | "_creationTime">>): Document {
    const now = Date.now();
    return {
      _id: generateId("documents"),
      _creationTime: now,
      accountId: generateId("accounts") as any,
      title: "Test Document",
      content: "# Test Document\n\nTest content",
      type: "deliverable",
      authorType: "user",
      authorId: "user_test",
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as Document;
  }

  static createMany(count: number, overrides?: Partial<Document>): Document[] {
    return Array.from({ length: count }, () =>
      DocumentFactory.create(overrides)
    );
  }
}

// ============================================================================
// Activity Factory
// ============================================================================

export class ActivityFactory {
  static create(overrides?: Partial<Omit<Activity, "_id" | "_creationTime">>): Activity {
    const now = Date.now();
    return {
      _id: generateId("activities"),
      _creationTime: now,
      accountId: generateId("accounts") as any,
      type: "task_created",
      actorType: "user",
      actorId: "user_test",
      actorName: "Test User",
      targetType: "task",
      targetId: generateId("tasks"),
      createdAt: now,
      ...overrides,
    } as Activity;
  }

  static createMany(count: number, overrides?: Partial<Activity>): Activity[] {
    return Array.from({ length: count }, () =>
      ActivityFactory.create(overrides)
    );
  }
}

// ============================================================================
// Notification Factory
// ============================================================================

export class NotificationFactory {
  static create(overrides?: Partial<Omit<Notification, "_id" | "_creationTime">>): Notification {
    const now = Date.now();
    return {
      _id: generateId("notifications"),
      _creationTime: now,
      accountId: generateId("accounts") as any,
      type: "mention",
      recipientType: "user",
      recipientId: "user_test",
      title: "You were mentioned",
      body: "Someone mentioned you in a task",
      createdAt: now,
      ...overrides,
    } as Notification;
  }

  static createMany(count: number, overrides?: Partial<Notification>): Notification[] {
    return Array.from({ length: count }, () =>
      NotificationFactory.create(overrides)
    );
  }
}

// ============================================================================
// Subscription Factory
// ============================================================================

export class SubscriptionFactory {
  static create(overrides?: Partial<Omit<Subscription, "_id" | "_creationTime">>): Subscription {
    const now = Date.now();
    return {
      _id: generateId("subscriptions"),
      _creationTime: now,
      accountId: generateId("accounts") as any,
      taskId: generateId("tasks") as any,
      subscriberType: "user",
      subscriberId: "user_test",
      subscribedAt: now,
      ...overrides,
    } as Subscription;
  }

  static createMany(count: number, overrides?: Partial<Subscription>): Subscription[] {
    return Array.from({ length: count }, () =>
      SubscriptionFactory.create(overrides)
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a mock Convex ID string
 * 
 * Format: "table_randomstring"
 */
function generateId(table: string): string {
  return `${table}_${Math.random().toString(36).substr(2, 12)}`;
}

/**
 * Create multiple related objects (e.g., account with agents)
 */
export function createTestContext() {
  const account = AccountFactory.create();
  const agents = AgentFactory.createMany(3, {
    accountId: account._id,
  });
  const tasks = TaskFactory.createMany(5, {
    accountId: account._id,
  });
  
  return {
    account,
    agents,
    tasks,
  };
}
