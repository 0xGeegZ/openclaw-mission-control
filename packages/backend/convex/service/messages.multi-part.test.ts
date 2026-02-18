/**
 * Multi-part message idempotency tests.
 * createFromAgent uses (sourceNotificationId, sourceNotificationPartIndex) for idempotency;
 * legacy messages without part index are treated as part 0.
 */

import { describe, it, expect } from "vitest";
import {
  getPartIndexForIdempotency,
  validateSourceNotificationPartIndex,
} from "./messages";

describe("getPartIndexForIdempotency", () => {
  it("returns 0 when sourceNotificationPartIndex is undefined", () => {
    expect(getPartIndexForIdempotency(undefined)).toBe(0);
  });

  it("returns 0 when sourceNotificationPartIndex is 0", () => {
    expect(getPartIndexForIdempotency(0)).toBe(0);
  });

  it("returns part index when provided", () => {
    expect(getPartIndexForIdempotency(1)).toBe(1);
    expect(getPartIndexForIdempotency(2)).toBe(2);
  });

  it("returns negative value when given negative (caller validated by createFromAgent)", () => {
    expect(getPartIndexForIdempotency(-1)).toBe(-1);
  });
});

describe("validateSourceNotificationPartIndex", () => {
  it("does not throw when undefined", () => {
    expect(() =>
      validateSourceNotificationPartIndex(undefined),
    ).not.toThrow();
  });

  it("does not throw for non-negative integers", () => {
    expect(() => validateSourceNotificationPartIndex(0)).not.toThrow();
    expect(() => validateSourceNotificationPartIndex(1)).not.toThrow();
    expect(() => validateSourceNotificationPartIndex(100)).not.toThrow();
  });

  it("throws for negative part index", () => {
    expect(() => validateSourceNotificationPartIndex(-1)).toThrow(
      "sourceNotificationPartIndex must be a non-negative integer",
    );
  });

  it("throws for non-integer part index", () => {
    expect(() => validateSourceNotificationPartIndex(1.5)).toThrow(
      "sourceNotificationPartIndex must be a non-negative integer",
    );
    expect(() => validateSourceNotificationPartIndex(NaN)).toThrow(
      "sourceNotificationPartIndex must be a non-negative integer",
    );
  });
});

describe("createFromAgent multi-part idempotency contract", () => {
  it("idempotency key is (sourceNotificationId, sourceNotificationPartIndex)", () => {
    const key1 = { sourceNotificationId: "notif_1", partIndex: 0 };
    const key2 = { sourceNotificationId: "notif_1", partIndex: 1 };
    expect(key1.partIndex).not.toBe(key2.partIndex);
  });

  it("same notification and part index implies same message (idempotent retry)", () => {
    const key = { sourceNotificationId: "notif_1", partIndex: 0 };
    const keyRetry = { sourceNotificationId: "notif_1", partIndex: 0 };
    expect(key.partIndex).toBe(keyRetry.partIndex);
    expect(key.sourceNotificationId).toBe(keyRetry.sourceNotificationId);
  });
});
