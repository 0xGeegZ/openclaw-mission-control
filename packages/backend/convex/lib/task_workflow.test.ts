/**
 * Unit tests for task workflow (transitions, pause-allowed status).
 */
import { describe, it, expect } from "vitest";
import {
  TaskStatus,
  TASK_STATUS_TRANSITIONS,
  isValidTransition,
  validateStatusRequirements,
  PAUSE_ALLOWED_STATUS_SET,
  isPauseAllowedStatus,
} from "./task_workflow";

describe("task_workflow", () => {
  describe("isPauseAllowedStatus", () => {
    it("returns true for assigned, in_progress, review", () => {
      expect(isPauseAllowedStatus("assigned")).toBe(true);
      expect(isPauseAllowedStatus("in_progress")).toBe(true);
      expect(isPauseAllowedStatus("review")).toBe(true);
    });

    it("returns false for inbox, done, blocked, archived", () => {
      expect(isPauseAllowedStatus("inbox")).toBe(false);
      expect(isPauseAllowedStatus("done")).toBe(false);
      expect(isPauseAllowedStatus("blocked")).toBe(false);
      expect(isPauseAllowedStatus("archived")).toBe(false);
    });

    it("matches PAUSE_ALLOWED_STATUS_SET", () => {
      const statuses: TaskStatus[] = [
        "inbox",
        "assigned",
        "in_progress",
        "review",
        "done",
        "blocked",
        "archived",
      ];
      for (const s of statuses) {
        expect(isPauseAllowedStatus(s)).toBe(PAUSE_ALLOWED_STATUS_SET.has(s));
      }
    });
  });

  describe("review -> blocked transition (for /stop)", () => {
    it("allows review to blocked in TASK_STATUS_TRANSITIONS", () => {
      expect(TASK_STATUS_TRANSITIONS.review).toContain("blocked");
    });

    it("isValidTransition allows review -> blocked", () => {
      expect(isValidTransition("review", "blocked")).toBe(true);
    });
  });

  describe("validateStatusRequirements for blocked", () => {
    it("requires blockedReason when transitioning to blocked", () => {
      expect(
        validateStatusRequirements("blocked", true, undefined),
      ).not.toBeNull();
      expect(
        validateStatusRequirements("blocked", true, "Paused by user (/stop)"),
      ).toBeNull();
    });
  });
});
