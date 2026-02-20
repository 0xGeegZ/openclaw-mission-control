/**
 * Unit tests for subscription helpers.
 * Covers syncSubscriptionsForAssignmentChange (assignee change → subscribe/unsubscribe).
 */

import { describe, it, expect, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  removeSubscriberIfSubscribed,
  syncSubscriptionsForAssignmentChange,
} from "./subscriptions";

function createMockCtx(options: {
  subscriptions?: Array<{
    _id: Id<"subscriptions">;
    accountId: Id<"accounts">;
    taskId: Id<"tasks">;
    subscriberType: "user" | "agent";
    subscriberId: string;
  }>;
  account?: {
    _id: Id<"accounts">;
    settings?: { orchestratorAgentId?: Id<"agents"> };
  } | null;
}) {
  const subscriptions = options.subscriptions ?? [];
  const account = options.account ?? null;
  const deletedIds: Id<"subscriptions">[] = [];
  const inserted: Array<{ table: string; data: Record<string, unknown> }> = [];

  const db = {
    get: vi
      .fn()
      .mockImplementation(async (id: Id<"accounts"> | Id<"agents">) => {
        if (account && id === account._id) return account;
        return null;
      }),
    query: vi.fn().mockImplementation((table: string) => {
      if (table !== "subscriptions") {
        return { withIndex: () => ({ unique: async () => null }) };
      }
      return {
        withIndex: vi
          .fn()
          .mockImplementation(
            (
              _index: string,
              fn: (q: { eq: (k: string, v: unknown) => unknown }) => unknown,
            ) => {
              const state: Record<string, unknown> = {};
              const q = {
                eq: (k: string, v: unknown) => {
                  state[k] = v;
                  return q;
                },
              };
              fn(q);
              return {
                unique: async () => {
                  const match = subscriptions.find(
                    (s) =>
                      s.taskId === state.taskId &&
                      s.subscriberType === state.subscriberType &&
                      s.subscriberId === state.subscriberId,
                  );
                  return match ?? null;
                },
              };
            },
          ),
      };
    }),
    insert: vi
      .fn()
      .mockImplementation(
        async (table: string, data: Record<string, unknown>) => {
          inserted.push({ table, data });
          return `new_${table}_${inserted.length}` as Id<"subscriptions">;
        },
      ),
    delete: vi.fn().mockImplementation(async (id: Id<"subscriptions">) => {
      deletedIds.push(id);
    }),
  };

  return {
    ctx: { db } as unknown as MutationCtx,
    getDeletedIds: () => [...deletedIds],
    getInserted: () => [...inserted],
  };
}

describe("removeSubscriberIfSubscribed", () => {
  it("returns false when no subscription exists", async () => {
    const { ctx } = createMockCtx({ subscriptions: [] });
    const accountId = "acc_1" as Id<"accounts">;
    const taskId = "task_1" as Id<"tasks">;

    const result = await removeSubscriberIfSubscribed(
      ctx,
      accountId,
      taskId,
      "user",
      "user_1",
    );
    expect(result).toBe(false);
  });

  it("deletes subscription and returns true when it exists and account matches", async () => {
    const accountId = "acc_1" as Id<"accounts">;
    const taskId = "task_1" as Id<"tasks">;
    const subId = "sub_1" as Id<"subscriptions">;
    const { ctx, getDeletedIds } = createMockCtx({
      subscriptions: [
        {
          _id: subId,
          accountId,
          taskId,
          subscriberType: "user",
          subscriberId: "user_1",
        },
      ],
    });

    const result = await removeSubscriberIfSubscribed(
      ctx,
      accountId,
      taskId,
      "user",
      "user_1",
    );
    expect(result).toBe(true);
    expect(getDeletedIds()).toEqual([subId]);
  });
});

describe("syncSubscriptionsForAssignmentChange", () => {
  const accountId = "acc_1" as Id<"accounts">;
  const taskId = "task_1" as Id<"tasks">;

  it("removes subscriptions for removed assignees and does not remove orchestrator", async () => {
    const orchestratorId = "agent_orch" as Id<"agents">;
    const removedAgentId = "agent_removed" as Id<"agents">;
    const subOrch = "sub_orch" as Id<"subscriptions">;
    const subRemoved = "sub_removed" as Id<"subscriptions">;
    const { ctx, getDeletedIds } = createMockCtx({
      account: {
        _id: accountId,
        settings: { orchestratorAgentId: orchestratorId },
      },
      subscriptions: [
        {
          _id: subOrch,
          accountId,
          taskId,
          subscriberType: "agent",
          subscriberId: orchestratorId,
        },
        {
          _id: subRemoved,
          accountId,
          taskId,
          subscriberType: "agent",
          subscriberId: removedAgentId,
        },
      ],
    });

    await syncSubscriptionsForAssignmentChange(
      ctx,
      accountId,
      taskId,
      ["user_1"],
      [orchestratorId, removedAgentId],
      [],
      [orchestratorId],
      orchestratorId,
    );

    expect(getDeletedIds()).toContain(subRemoved);
    expect(getDeletedIds()).not.toContain(subOrch);
  });

  it("adds subscriptions for new assignees", async () => {
    const { ctx, getInserted } = createMockCtx({ account: null });

    await syncSubscriptionsForAssignmentChange(
      ctx,
      accountId,
      taskId,
      [],
      [],
      ["user_new"],
      ["agent_new" as Id<"agents">],
      undefined,
    );

    const inserted = getInserted();
    expect(
      inserted.filter(
        (i) =>
          i.data.subscriberType === "user" &&
          i.data.subscriberId === "user_new",
      ),
    ).toHaveLength(1);
    expect(
      inserted.filter(
        (i) =>
          i.data.subscriberType === "agent" &&
          i.data.subscriberId === "agent_new",
      ),
    ).toHaveLength(1);
  });
});
