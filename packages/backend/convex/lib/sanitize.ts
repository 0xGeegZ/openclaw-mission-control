/**
 * Sanitization helpers for persisted data (e.g. upgrade errors) to avoid storing
 * stack traces, file paths, or unbounded content.
 */

/** Max length for persisted upgrade error messages. */
export const UPGRADE_ERROR_MAX_LENGTH = 2048;

/**
 * Sanitizes an upgrade error string before persisting: keeps first line only
 * (drops stack traces) and truncates to UPGRADE_ERROR_MAX_LENGTH.
 * @param error - Raw error string from runtime (may contain stack traces)
 * @returns Sanitized string or undefined if input is undefined
 */
export function sanitizeUpgradeError(
  error: string | undefined,
): string | undefined {
  if (error === undefined || error === null) return undefined;
  const firstLine = String(error).split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) return undefined;
  return firstLine.length > UPGRADE_ERROR_MAX_LENGTH
    ? firstLine.slice(0, UPGRADE_ERROR_MAX_LENGTH)
    : firstLine;
}
