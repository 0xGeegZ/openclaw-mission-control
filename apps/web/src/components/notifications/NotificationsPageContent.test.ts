import { describe, expect, it } from "vitest";
import { mergeNotificationsById } from "./NotificationsPageContent";
import type { Doc } from "@packages/backend/convex/_generated/dataModel";

function createNotification(
  id: string,
  overrides?: Partial<Doc<"notifications">>,
): Doc<"notifications"> {
  return {
    _id: id as Doc<"notifications">["_id"],
    _creationTime: Date.now(),
    accountId: "account_1" as Doc<"notifications">["accountId"],
    body: `Body ${id}`,
    createdAt: Date.now(),
    deliveredAt: undefined,
    messageId: undefined,
    readAt: undefined,
    recipientId: "user_1" as Doc<"notifications">["recipientId"],
    recipientType: "user",
    taskId: undefined,
    title: `Title ${id}`,
    type: "mention",
    ...overrides,
  };
}

describe("mergeNotificationsById", () => {
  it("appends unseen notifications", () => {
    const current = [createNotification("n1"), createNotification("n2")];
    const incoming = [createNotification("n3")];

    const result = mergeNotificationsById(current, incoming);

    expect(result.map((notification) => notification._id)).toEqual([
      "n1",
      "n2",
      "n3",
    ]);
  });

  it("updates existing notifications without duplicating ids", () => {
    const current = [
      createNotification("n1", { readAt: undefined }),
      createNotification("n2"),
    ];
    const incoming = [createNotification("n1", { readAt: 123 })];

    const result = mergeNotificationsById(current, incoming);

    expect(result).toHaveLength(2);
    expect(result[0]?.readAt).toBe(123);
  });

  it("handles mixed existing and new notifications in one merge", () => {
    const current = [createNotification("n1"), createNotification("n2")];
    const incoming = [
      createNotification("n2", { title: "Updated title" }),
      createNotification("n3"),
    ];

    const result = mergeNotificationsById(current, incoming);

    expect(result).toHaveLength(3);
    expect(result[1]?.title).toBe("Updated title");
    expect(result[2]?._id).toBe("n3");
  });
});
