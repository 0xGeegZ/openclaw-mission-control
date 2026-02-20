/**
 * Unit tests for typing helper used by listAgentIdsTypingByTask and listAgentIdsTypingByAccount.
 * Typing is determined only by readAt, deliveredAt, deliveryEndedAt (no time window).
 */
import { describe, it, expect } from "vitest";
import { _isInTypingWindow } from "./notifications";

describe("_isInTypingWindow", () => {
  const readAt = 99_000;

  it("returns false when readAt is null", () => {
    expect(_isInTypingWindow(null, undefined, undefined)).toBe(false);
    expect(_isInTypingWindow(undefined, undefined, undefined)).toBe(false);
  });

  it("returns false when deliveredAt is set", () => {
    expect(_isInTypingWindow(readAt, 98_500, undefined)).toBe(false);
  });

  it("returns false when deliveryEndedAt is set", () => {
    expect(_isInTypingWindow(readAt, undefined, 98_500)).toBe(false);
    expect(_isInTypingWindow(readAt, null, 98_900)).toBe(false);
  });

  it("returns true when read, not delivered, not ended", () => {
    expect(_isInTypingWindow(readAt, undefined, undefined)).toBe(true);
    expect(_isInTypingWindow(readAt, null, null)).toBe(true);
  });

  it("returns true after deliveryEndedAt is cleared (retry scenario)", () => {
    expect(_isInTypingWindow(readAt, undefined, 98_500)).toBe(false);
    expect(_isInTypingWindow(readAt, undefined, undefined)).toBe(true);
  });
});
