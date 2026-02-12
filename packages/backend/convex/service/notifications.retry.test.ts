import { describe, expect, it } from "vitest";
import { shouldCreateResponseRequestRetry } from "./notifications";

describe("shouldCreateResponseRequestRetry", () => {
  const NOW_MS = 1_700_000_000_000;
  const COOLDOWN_MS = 4 * 60 * 60 * 1000;

  it("allows retry when recipient replied after latest request", () => {
    const result = shouldCreateResponseRequestRetry({
      latestRequestCreatedAt: NOW_MS - 60_000,
      latestRequestDeliveredAt: NOW_MS - 59_000,
      latestReplyCreatedAt: NOW_MS - 30_000,
      nowMs: NOW_MS,
      retryCooldownMs: COOLDOWN_MS,
    });

    expect(result).toBe(true);
  });

  it("blocks retry when latest request is still undelivered", () => {
    const result = shouldCreateResponseRequestRetry({
      latestRequestCreatedAt: NOW_MS - COOLDOWN_MS - 1,
      latestRequestDeliveredAt: undefined,
      latestReplyCreatedAt: undefined,
      nowMs: NOW_MS,
      retryCooldownMs: COOLDOWN_MS,
    });

    expect(result).toBe(false);
  });

  it("blocks retry before cooldown when no reply was posted", () => {
    const result = shouldCreateResponseRequestRetry({
      latestRequestCreatedAt: NOW_MS - (COOLDOWN_MS - 60_000),
      latestRequestDeliveredAt: NOW_MS - (COOLDOWN_MS - 59_000),
      latestReplyCreatedAt: undefined,
      nowMs: NOW_MS,
      retryCooldownMs: COOLDOWN_MS,
    });

    expect(result).toBe(false);
  });

  it("allows retry after cooldown when no reply was posted", () => {
    const result = shouldCreateResponseRequestRetry({
      latestRequestCreatedAt: NOW_MS - COOLDOWN_MS - 1,
      latestRequestDeliveredAt: NOW_MS - COOLDOWN_MS + 1,
      latestReplyCreatedAt: undefined,
      nowMs: NOW_MS,
      retryCooldownMs: COOLDOWN_MS,
    });

    expect(result).toBe(true);
  });
});
