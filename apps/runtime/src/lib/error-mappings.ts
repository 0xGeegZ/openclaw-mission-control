/**
 * Error mapping utilities for HTTP responses.
 * Consolidates error-to-status-code mapping logic.
 */

/**
 * Map task errors to HTTP status codes.
 * @param message - The error message to map
 * @param validations - Optional custom validation patterns with their status codes
 */
export function mapTaskError(
  message: string,
  validations?: Record<string, number>,
): {
  status: number;
  message: string;
} {
  const normalized = message.toLowerCase();

  // Check custom validations first
  if (validations) {
    for (const [pattern, status] of Object.entries(validations)) {
      if (normalized.includes(pattern.toLowerCase())) {
        return { status, message };
      }
    }
  }

  // Common auth errors
  if (normalized.includes("unauthorized")) {
    return { status: 401, message };
  }
  if (normalized.includes("forbidden")) {
    return { status: 403, message };
  }
  if (normalized.includes("not found")) {
    return { status: 404, message };
  }

  // Validation errors (default 422)
  if (
    normalized.includes("invalid transition") ||
    normalized.includes("invalid status change") ||
    normalized.includes("invalid status") ||
    normalized.includes("invalid priority") ||
    normalized.includes("invalid agent")
  ) {
    return { status: 422, message };
  }

  // Default based on context (caller can override)
  return { status: 500, message };
}
