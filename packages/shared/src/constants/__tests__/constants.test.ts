import { describe, it, expect } from "vitest";
import {
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_TRANSITIONS,
} from "../index";
import type { TaskStatus } from "../../types";

describe("task status constants", () => {
  const allStatuses: TaskStatus[] = [
    "inbox",
    "assigned",
    "in_progress",
    "review",
    "done",
    "blocked",
  ];

  it("TASK_STATUS_ORDER contains only valid statuses", () => {
    for (const status of TASK_STATUS_ORDER) {
      expect(allStatuses).toContain(status);
    }
  });

  it("TASK_STATUS_LABELS has an entry for every TaskStatus", () => {
    for (const status of allStatuses) {
      expect(TASK_STATUS_LABELS[status]).toBeDefined();
      expect(typeof TASK_STATUS_LABELS[status]).toBe("string");
    }
  });

  it("TASK_STATUS_TRANSITIONS has an entry for every TaskStatus", () => {
    for (const status of allStatuses) {
      expect(Array.isArray(TASK_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });
});
