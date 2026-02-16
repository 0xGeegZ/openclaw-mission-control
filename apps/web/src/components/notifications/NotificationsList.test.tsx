/**
 * Unit tests for NotificationsList helper functions.
 *
 * These tests exercise real logic exported by NotificationsList.tsx.
 */

import { describe, it, expect } from "vitest";
import {
  type NotificationItem,
  getDisplayedNotifications,
  getNotificationTypeLabel,
  getUnreadCount,
  getVisibleNotifications,
} from "./NotificationsList";

const NOW = 1_700_000_000_000;

function buildNotifications(): NotificationItem[] {
  return [
    {
      _id: "notif_1",
      type: "mention",
      title: "Alice mentioned you",
      body: "Please review",
      createdAt: NOW,
      taskId: "task_1",
    },
    {
      _id: "notif_2",
      type: "thread_update",
      title: "New reply",
      body: "Bob replied",
      createdAt: NOW - 60_000,
      readAt: NOW - 30_000,
      taskId: "task_2",
    },
    {
      _id: "notif_3",
      type: "role_changed",
      title: "Role updated",
      body: "You are now admin",
      createdAt: NOW - 120_000,
    },
  ];
}

describe("getNotificationTypeLabel", () => {
  it("maps known notification types to short labels", () => {
    expect(getNotificationTypeLabel("mention")).toBe("Mention");
    expect(getNotificationTypeLabel("thread_update")).toBe("Reply");
    expect(getNotificationTypeLabel("assignment")).toBe("Assigned");
    expect(getNotificationTypeLabel("member_removed")).toBe("Removed");
  });
});

describe("getUnreadCount", () => {
  it("counts only notifications without readAt", () => {
    expect(getUnreadCount(buildNotifications())).toBe(2);
  });
});

describe("getDisplayedNotifications", () => {
  it("returns all notifications when filter is all", () => {
    const notifications = buildNotifications();
    expect(getDisplayedNotifications(notifications, "all")).toHaveLength(3);
  });

  it("returns only unread notifications when filter is unread", () => {
    const notifications = buildNotifications();
    const unread = getDisplayedNotifications(notifications, "unread");
    expect(unread).toHaveLength(2);
    expect(unread.every((notification) => !notification.readAt)).toBe(true);
  });
});

describe("getVisibleNotifications", () => {
  it("removes dismissed notifications from the displayed list", () => {
    const notifications = buildNotifications();
    const dismissed = new Set<string>(["notif_1", "notif_3"]);
    const visible = getVisibleNotifications(notifications, dismissed);
    expect(visible).toHaveLength(1);
    expect(visible[0]?._id).toBe("notif_2");
  });

  it("keeps all notifications when dismissed set is empty", () => {
    const notifications = buildNotifications();
    const visible = getVisibleNotifications(notifications, new Set<string>());
    expect(visible).toHaveLength(3);
  });
});
