import { describe, expect, it } from "vitest";
import { ANALYTICS_TIME_RANGE } from "./lib/constants";
import { resolveTimeRange } from "./analytics";

describe("analytics.resolveTimeRange", () => {
  const now = 1_700_000_000_000; // fixed timestamp for stable tests

  it("day: fromDate is 24h before toDate", () => {
    const { fromDate, now: end } = resolveTimeRange({
      timeRange: ANALYTICS_TIME_RANGE.DAY,
      toDate: now,
    });
    expect(end).toBe(now);
    expect(fromDate).toBe(now - 24 * 60 * 60 * 1000);
  });

  it("week: fromDate is 7 days before toDate", () => {
    const { fromDate, now: end } = resolveTimeRange({
      timeRange: ANALYTICS_TIME_RANGE.WEEK,
      toDate: now,
    });
    expect(end).toBe(now);
    expect(fromDate).toBe(now - 7 * 24 * 60 * 60 * 1000);
  });

  it("month: fromDate is 30 days before toDate", () => {
    const { fromDate, now: end } = resolveTimeRange({
      timeRange: ANALYTICS_TIME_RANGE.MONTH,
      toDate: now,
    });
    expect(end).toBe(now);
    expect(fromDate).toBe(now - 30 * 24 * 60 * 60 * 1000);
  });

  it("custom: uses fromDate when provided", () => {
    const from = now - 3 * 24 * 60 * 60 * 1000;
    const { fromDate, now: end } = resolveTimeRange({
      timeRange: ANALYTICS_TIME_RANGE.CUSTOM,
      fromDate: from,
      toDate: now,
    });
    expect(fromDate).toBe(from);
    expect(end).toBe(now);
  });

  it("custom: throws when fromDate is missing", () => {
    expect(() =>
      resolveTimeRange({
        timeRange: ANALYTICS_TIME_RANGE.CUSTOM,
        toDate: now,
      }),
    ).toThrow("fromDate is required for custom time range");
  });

  it("defaults toDate to Date.now() when omitted", () => {
    const before = Date.now();
    const { now: end } = resolveTimeRange({
      timeRange: ANALYTICS_TIME_RANGE.WEEK,
    });
    const after = Date.now();
    expect(end).toBeGreaterThanOrEqual(before);
    expect(end).toBeLessThanOrEqual(after + 10);
  });
});
