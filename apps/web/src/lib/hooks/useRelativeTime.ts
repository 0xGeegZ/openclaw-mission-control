"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

const TICK_MS = 60_000;

export interface UseRelativeTimeOptions {
  /** Passed to date-fns formatDistanceToNow (e.g. "ago" suffix). Default true. */
  addSuffix?: boolean;
  /** Shown when timestamp is null/undefined or invalid. */
  fallback?: string;
}

/**
 * Returns a relative time string that updates on a timer (e.g. "2 minutes ago").
 * Re-computes every 60s when the timestamp is valid so the label advances without new data from the server.
 *
 * @param timestampMs - Unix timestamp in ms (e.g. agent.lastHeartbeat from Convex), or null/undefined when unknown.
 * @param options.addSuffix - Whether to add "ago" suffix. Default true.
 * @param options.fallback - String returned when timestamp is null/undefined/invalid or formatDistanceToNow throws. Default "".
 * @returns Formatted relative time string, or options.fallback when invalid.
 */
export function useRelativeTime(
  timestampMs: number | null | undefined,
  options: UseRelativeTimeOptions = {},
): string {
  const { addSuffix = true, fallback = "" } = options;
  const [, setNow] = useState(() => Date.now());
  const isValid =
    timestampMs != null &&
    typeof timestampMs === "number" &&
    timestampMs > 0;

  useEffect(() => {
    if (!isValid) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [isValid]);

  if (!isValid) {
    return fallback;
  }

  try {
    return formatDistanceToNow(timestampMs, { addSuffix });
  } catch {
    return fallback;
  }
}
