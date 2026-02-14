/**
 * Behavioral tests for notification helper functions.
 *
 * These tests call real helpers from lib/notifications.ts and verify concrete
 * side effects (created notification rows and returned IDs).
 */

import { describe, it, expect, vi } from "vitest";
import { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { RecipientType } from "@packages/shared";
import {
  createAssignmentNotification,
  createMemberAddedNotification,
  createMemberRemovedNotification,
  createMentionNotifications,
  createRoleChangeNotification,
  createStatusChangeNotification,
  createThreadNotifications,
  shouldCreateUserNotification,
} from "./notifications";

type SubscriptionRow = {
  subscriberType: RecipientType;
  subscriberId: string;
};

function createMockNotificationContext(options?: {
  accountExists?: boolean;
  accountPrefs?: Record<string, boolean> | null;
  subscriptions?: SubscriptionRow[];
}) {
  const accountExists = options?.accountExists !== false;
  const accountPrefs = options?.accountPrefs ?? {
    taskUpdates: true,
    agentActivity: true,
    memberUpdates: true,
  };
  const subscriptions = options?.subscriptions ?? [];
  const insertedNotifications: Array<Record<string, unknown>> = [];

  const db = {
    get: vi.fn().mockImplementation(async (_id: Id<"accounts">) => {
      if (!accountExists) return null;
      return {
        _id: "account_1" as Id<"accounts">,
        settings:
          accountPrefs === null
            ? undefined
            : { notificationPreferences: accountPrefs },
      };
    }),
    insert: vi
      .fn()
      .mockImplementation(
        async (table: string, data: Record<string, unknown>) => {
          if (table === "notifications") {
            insertedNotifications.push(data);
            return `notif_${insertedNotifications.length}` as Id<"notifications">;
          }
          return `id_${Math.random().toString(36).slice(2, 9)}`;
        },
      ),
    query: vi.fn().mockReturnValue({
      withIndex: vi.fn().mockReturnValue({
        collect: vi.fn().mockResolvedValue(subscriptions),
      }),
    }),
  };

  return {
    db,
    getInsertedNotifications: () => insertedNotifications,
  } as unknown as MutationCtx & {
    getInsertedNotifications: () => typeof insertedNotifications;
  };
}

describe("shouldCreateUserNotification", () => {
  const accountId = "account_1" as Id<"accounts">;

  it("returns true when forceCreate is set", async () => {
    const ctx = createMockNotificationContext({
      accountPrefs: { agentActivity: false },
    });
    const result = await shouldCreateUserNotification(
      ctx,
      accountId,
      "agentActivity",
      { forceCreate: true },
    );
    expect(result).toBe(true);
  });

  it("returns false when account is missing", async () => {
    const ctx = createMockNotificationContext({ accountExists: false });
    const result = await shouldCreateUserNotification(
      ctx,
      accountId,
      "agentActivity",
    );
    expect(result).toBe(false);
  });

  it("returns true when preferences object is absent", async () => {
    const ctx = createMockNotificationContext({ accountPrefs: null });
    const result = await shouldCreateUserNotification(
      ctx,
      accountId,
      "taskUpdates",
    );
    expect(result).toBe(true);
  });

  it("returns false only when category is explicitly false", async () => {
    const ctx = createMockNotificationContext({
      accountPrefs: {
        taskUpdates: true,
        agentActivity: false,
        memberUpdates: true,
      },
    });
    const result = await shouldCreateUserNotification(
      ctx,
      accountId,
      "agentActivity",
    );
    expect(result).toBe(false);
  });
});

describe("createMentionNotifications", () => {
  const accountId = "account_1" as Id<"accounts">;
  const taskId = "task_1" as Id<"tasks">;
  const messageId = "msg_1" as Id<"messages">;

  it("creates mention notifications and returns their ids", async () => {
    const ctx = createMockNotificationContext();
    const ids = await createMentionNotifications(
      ctx,
      accountId,
      taskId,
      messageId,
      [
        { type: "user", id: "user_alice", name: "Alice" },
        {
          type: "agent",
          id: "agent_reviewer",
          name: "Reviewer",
          slug: "reviewer",
        },
      ],
      "Bob",
      "Fix auth checks",
    );

    expect(ids).toEqual([
      "notif_1" as Id<"notifications">,
      "notif_2" as Id<"notifications">,
    ]);
    const inserted = ctx.getInsertedNotifications();
    expect(inserted).toHaveLength(2);
    expect(inserted[0]?.type).toBe("mention");
    expect(inserted[0]?.recipientId).toBe("user_alice");
    expect(inserted[1]?.recipientId).toBe("agent_reviewer");
  });

  it("skips user mentions when agentActivity preference is disabled", async () => {
    const ctx = createMockNotificationContext({
      accountPrefs: {
        taskUpdates: true,
        agentActivity: false,
        memberUpdates: true,
      },
    });
    const ids = await createMentionNotifications(
      ctx,
      accountId,
      taskId,
      messageId,
      [
        { type: "user", id: "user_alice", name: "Alice" },
        {
          type: "agent",
          id: "agent_reviewer",
          name: "Reviewer",
          slug: "reviewer",
        },
      ],
      "Bob",
      "Fix auth checks",
    );

    expect(ids).toEqual(["notif_1" as Id<"notifications">]);
    const inserted = ctx.getInsertedNotifications();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.recipientType).toBe("agent");
  });
});

describe("createThreadNotifications", () => {
  const accountId = "account_1" as Id<"accounts">;
  const taskId = "task_1" as Id<"tasks">;
  const messageId = "msg_1" as Id<"messages">;

  it("notifies subscribers except author and mentioned recipients", async () => {
    const ctx = createMockNotificationContext({
      subscriptions: [
        { subscriberType: "user", subscriberId: "user_author" },
        { subscriberType: "user", subscriberId: "user_alice" },
        { subscriberType: "user", subscriberId: "user_mentioned" },
        { subscriberType: "agent", subscriberId: "agent_reviewer" },
      ],
    });

    await createThreadNotifications(
      ctx,
      accountId,
      taskId,
      messageId,
      "user",
      "user_author",
      "Author",
      "Task Title",
      new Set(["user_mentioned"]),
      false,
    );

    const inserted = ctx.getInsertedNotifications();
    expect(
      inserted.map((row: Record<string, unknown>) => row.recipientId),
    ).toEqual(["user_alice", "agent_reviewer"]);
    expect(
      inserted.every(
        (row: Record<string, unknown>) => row.type === "thread_update",
      ),
    ).toBe(true);
  });

  it("skips all agent thread notifications when hasAgentMentions is true", async () => {
    const ctx = createMockNotificationContext({
      subscriptions: [
        { subscriberType: "user", subscriberId: "user_alice" },
        { subscriberType: "agent", subscriberId: "agent_reviewer" },
      ],
    });

    await createThreadNotifications(
      ctx,
      accountId,
      taskId,
      messageId,
      "user",
      "user_author",
      "Author",
      "Task Title",
      new Set(),
      true,
    );

    const inserted = ctx.getInsertedNotifications();
    expect(
      inserted.map((row: Record<string, unknown>) => row.recipientId),
    ).toEqual(["user_alice"]);
  });

  it("skips all agent thread notifications when task is done", async () => {
    const ctx = createMockNotificationContext({
      subscriptions: [
        { subscriberType: "user", subscriberId: "user_alice" },
        { subscriberType: "agent", subscriberId: "agent_reviewer" },
      ],
    });

    await createThreadNotifications(
      ctx,
      accountId,
      taskId,
      messageId,
      "user",
      "user_author",
      "Author",
      "Task Title",
      new Set(),
      false,
      "done",
    );

    const inserted = ctx.getInsertedNotifications();
    expect(
      inserted.map((row: Record<string, unknown>) => row.recipientId),
    ).toEqual(["user_alice"]);
  });

  it("skips user recipients when agentActivity preference is disabled", async () => {
    const ctx = createMockNotificationContext({
      accountPrefs: {
        taskUpdates: true,
        agentActivity: false,
        memberUpdates: true,
      },
      subscriptions: [
        { subscriberType: "user", subscriberId: "user_alice" },
        { subscriberType: "agent", subscriberId: "agent_reviewer" },
      ],
    });

    await createThreadNotifications(
      ctx,
      accountId,
      taskId,
      messageId,
      "user",
      "user_author",
      "Author",
      "Task Title",
      new Set(),
      false,
    );

    const inserted = ctx.getInsertedNotifications();
    expect(
      inserted.map((row: Record<string, unknown>) => row.recipientId),
    ).toEqual(["agent_reviewer"]);
  });

  it("allows only the orchestrator agent among agents in orchestrator chat mode", async () => {
    const ctx = createMockNotificationContext({
      subscriptions: [
        { subscriberType: "agent", subscriberId: "agent_reviewer" },
        { subscriberType: "agent", subscriberId: "agent_orchestrator" },
        { subscriberType: "user", subscriberId: "user_alice" },
      ],
    });

    await createThreadNotifications(
      ctx,
      accountId,
      taskId,
      messageId,
      "user",
      "user_author",
      "Author",
      "Task Title",
      new Set(),
      false,
      undefined,
      {
        isOrchestratorChat: true,
        orchestratorAgentId: "agent_orchestrator" as Id<"agents">,
      },
    );

    const inserted = ctx.getInsertedNotifications();
    expect(
      inserted.map((row: Record<string, unknown>) => row.recipientId),
    ).toEqual(["agent_orchestrator", "user_alice"]);
  });
});

describe("targeted notification creators", () => {
  const accountId = "account_1" as Id<"accounts">;
  const taskId = "task_1" as Id<"tasks">;

  it("assignment/status creators skip user notifications when taskUpdates is false", async () => {
    const ctx = createMockNotificationContext({
      accountPrefs: {
        taskUpdates: false,
        agentActivity: true,
        memberUpdates: true,
      },
    });

    const assignmentId = await createAssignmentNotification(
      ctx,
      accountId,
      taskId,
      "user",
      "user_alice",
      "Bob",
      "Task",
    );
    const statusId = await createStatusChangeNotification(
      ctx,
      accountId,
      taskId,
      "user",
      "user_alice",
      "Bob",
      "Task",
      "review",
    );

    expect(assignmentId).toBeNull();
    expect(statusId).toBeNull();
    expect(ctx.getInsertedNotifications()).toHaveLength(0);
  });

  it("assignment creator still allows agent recipients when taskUpdates is false", async () => {
    const ctx = createMockNotificationContext({
      accountPrefs: {
        taskUpdates: false,
        agentActivity: true,
        memberUpdates: true,
      },
    });

    const assignmentId = await createAssignmentNotification(
      ctx,
      accountId,
      taskId,
      "agent",
      "agent_reviewer",
      "Bob",
      "Task",
    );

    expect(assignmentId).toBe("notif_1");
    expect(ctx.getInsertedNotifications()[0]?.recipientType).toBe("agent");
  });

  it("member-related creators skip when memberUpdates is false", async () => {
    const ctx = createMockNotificationContext({
      accountPrefs: {
        taskUpdates: true,
        agentActivity: true,
        memberUpdates: false,
      },
    });

    const added = await createMemberAddedNotification(
      ctx,
      accountId,
      "user_alice",
      "Acme",
      "Bob",
    );
    const removed = await createMemberRemovedNotification(
      ctx,
      accountId,
      "user_alice",
      "Acme",
    );
    const roleChanged = await createRoleChangeNotification(
      ctx,
      accountId,
      "user_alice",
      "admin",
      "Acme",
    );

    expect(added).toBeNull();
    expect(removed).toBeNull();
    expect(roleChanged).toBeNull();
    expect(ctx.getInsertedNotifications()).toHaveLength(0);
  });

  it("member-related creators create notifications when memberUpdates is true", async () => {
    const ctx = createMockNotificationContext({
      accountPrefs: {
        taskUpdates: true,
        agentActivity: true,
        memberUpdates: true,
      },
    });

    await createMemberAddedNotification(
      ctx,
      accountId,
      "user_alice",
      "Acme",
      "Bob",
    );
    await createMemberRemovedNotification(ctx, accountId, "user_alice", "Acme");
    await createRoleChangeNotification(
      ctx,
      accountId,
      "user_alice",
      "admin",
      "Acme",
    );

    const inserted = ctx.getInsertedNotifications();
    expect(inserted).toHaveLength(3);
    expect(inserted.map((row: Record<string, unknown>) => row.type)).toEqual([
      "member_added",
      "member_removed",
      "role_changed",
    ]);
  });
});
