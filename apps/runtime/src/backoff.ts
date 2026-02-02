/**
 * Exponential backoff with jitter for delivery poll errors.
 * Unit-testable; no side effects.
 */

const DEFAULT_BASE_MS = 5000;
const DEFAULT_MAX_MS = 300000; // 5 min

/**
 * Compute next delay in ms using exponential backoff with full jitter.
 * Formula: min(max, base * 2^attempt) then multiply by random in [0, 1].
 *
 * @param attempt - Current attempt count (0-based).
 * @param baseMs - Base delay in ms.
 * @param maxMs - Cap delay in ms.
 * @returns Delay in ms (>= 0).
 */
export function backoffMs(
  attempt: number,
  baseMs: number = DEFAULT_BASE_MS,
  maxMs: number = DEFAULT_MAX_MS
): number {
  if (attempt <= 0) return baseMs;
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  return Math.floor(exp * Math.random()) + 1;
}

/**
 * Default base delay for backoff (ms).
 */
export const DEFAULT_BACKOFF_BASE_MS = DEFAULT_BASE_MS;

/**
 * Default max delay for backoff (ms).
 */
export const DEFAULT_BACKOFF_MAX_MS = DEFAULT_MAX_MS;
