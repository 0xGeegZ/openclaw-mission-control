import { describe, expect, it, vi } from "vitest";

import { getActivityDescription, logActivity } from "./activity";

describe("activity helpers", () => {
  it("inserts activity rows and falls back actorName to actorId", async () => {
    const insert = vi.fn(async () => "activity_1");
    const ctx = { db: { insert } };

    const activityId = await logActivity({
      ctx: ctx as never,
      accountId: "account_1" as never,
      type: "task_created",
      actorType: "user",
      actorId: "user_1",
      targetType: "task",
      targetId: "task_1",
      targetName: "Test task",
    });

    expect(activityId).toBe("activity_1");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      "activities",
      expect.objectContaining({
        accountId: "account_1",
        type: "task_created",
        actorType: "user",
        actorId: "user_1",
        actorName: "user_1",
        targetType: "task",
        targetId: "task_1",
        targetName: "Test task",
      }),
    );
  });

  it("returns specific messages for core activity types", () => {
    expect(getActivityDescription("account_created", "Alice", "Acme")).toBe(
      'Alice created account "Acme"',
    );
    expect(getActivityDescription("account_updated", "Alice")).toBe(
      "Alice updated account settings",
    );
    expect(getActivityDescription("task_created", "Alice", "T1")).toBe(
      'Alice created task "T1"',
    );
    expect(getActivityDescription("task_updated", "Alice", "T1")).toBe(
      'Alice updated task "T1"',
    );
    expect(getActivityDescription("task_status_changed", "Alice", "T1")).toBe(
      'Alice changed status of "T1"',
    );
    expect(getActivityDescription("message_created", "Alice", "T1")).toBe(
      'Alice commented on "T1"',
    );
  });

  it("formats agent and runtime status changes with old/new states", () => {
    expect(
      getActivityDescription("agent_status_changed", "Alice", undefined, {
        oldStatus: "online",
        newStatus: "busy",
      }),
    ).toBe("status changed from Online to Busy");
    expect(
      getActivityDescription("runtime_status_changed", "Alice", undefined, {
        oldStatus: "degraded",
        newStatus: "online",
      }),
    ).toBe("status changed from Degraded to Online");
  });

  it("uses fallback messages when status-change metadata is missing", () => {
    expect(getActivityDescription("agent_status_changed", "Alice")).toBe(
      "status changed",
    );
    expect(getActivityDescription("runtime_status_changed", "Alice")).toBe(
      "runtime status changed",
    );
  });

  it("returns member action messages and default target fallbacks", () => {
    expect(getActivityDescription("member_added", "Alice", "Bob")).toBe(
      "Alice added Bob",
    );
    expect(getActivityDescription("member_removed", "Alice", "Bob")).toBe(
      "Alice removed Bob",
    );
    expect(getActivityDescription("member_updated", "Alice")).toBe(
      'Alice updated member "an item"',
    );
    expect(getActivityDescription("role_changed", "Alice")).toBe(
      "Alice changed role of a member",
    );
  });
});
