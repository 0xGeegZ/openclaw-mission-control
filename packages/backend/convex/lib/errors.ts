/**
 * Standardized error handling for Convex backend.
 * Provides ConvexError class and ErrorCode enum for consistent error categorization.
 */

/**
 * Error codes for backend operations.
 * Used to categorize and handle different types of errors uniformly.
 */
export enum ErrorCode {
  // Authorization & Access
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",

  // Validation & Input
  INVALID_INPUT = "INVALID_INPUT",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",

  // Business Logic
  CONFLICT = "CONFLICT",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  INVALID_STATE = "INVALID_STATE",
  OPERATION_NOT_ALLOWED = "OPERATION_NOT_ALLOWED",

  // Database & Data
  DATABASE_ERROR = "DATABASE_ERROR",
  CONCURRENT_MODIFICATION = "CONCURRENT_MODIFICATION",
  REFERENCE_NOT_FOUND = "REFERENCE_NOT_FOUND",

  // External & Integration
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  TIMEOUT = "TIMEOUT",

  // Server & System
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
}

/**
 * ConvexError: Standardized error class for backend operations.
 * Encapsulates error code, message, and optional metadata for consistent error handling.
 *
 * @example
 * throw new ConvexError({
 *   code: ErrorCode.UNAUTHORIZED,
 *   message: "User is not authenticated",
 *   statusCode: 401,
 * });
 */
export class ConvexError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly metadata?: Record<string, unknown>;

  constructor(options: {
    code: ErrorCode;
    message: string;
    statusCode?: number;
    metadata?: Record<string, unknown>;
  }) {
    const { code, message, statusCode = 500, metadata } = options;

    super(message);
    this.name = "ConvexError";
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ConvexError.prototype);
  }

  /**
   * Check if a value is a ConvexError instance.
   * Useful for error handling and type guards.
   */
  static isConvexError(value: unknown): value is ConvexError {
    return value instanceof ConvexError;
  }

  /**
   * Convert error to JSON for logging or API responses.
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.metadata && { metadata: this.metadata }),
    };
  }
}

/**
 * Creates a 400 Bad Request error for validation failures.
 */
export function validationError(
  message: string,
  metadata?: Record<string, unknown>
) {
  return new ConvexError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    statusCode: 400,
    metadata,
  });
}

/**
 * Creates a 401 Unauthorized error.
 */
export function unauthorizedError(
  message: string = "Unauthorized",
  metadata?: Record<string, unknown>
) {
  return new ConvexError({
    code: ErrorCode.UNAUTHORIZED,
    message,
    statusCode: 401,
    metadata,
  });
}

/**
 * Creates a 403 Forbidden error.
 */
export function forbiddenError(
  message: string = "Forbidden",
  metadata?: Record<string, unknown>
) {
  return new ConvexError({
    code: ErrorCode.FORBIDDEN,
    message,
    statusCode: 403,
    metadata,
  });
}

/**
 * Creates a 404 Not Found error.
 */
export function notFoundError(
  message: string = "Not found",
  metadata?: Record<string, unknown>
) {
  return new ConvexError({
    code: ErrorCode.NOT_FOUND,
    message,
    statusCode: 404,
    metadata,
  });
}

/**
 * Creates a 409 Conflict error for state/data conflicts.
 */
export function conflictError(
  message: string,
  metadata?: Record<string, unknown>
) {
  return new ConvexError({
    code: ErrorCode.CONFLICT,
    message,
    statusCode: 409,
    metadata,
  });
}

/**
 * Creates a 429 Too Many Requests error for quota exceeded.
 */
export function quotaExceededError(
  message: string,
  metadata?: Record<string, unknown>
) {
  return new ConvexError({
    code: ErrorCode.QUOTA_EXCEEDED,
    message,
    statusCode: 429,
    metadata,
  });
}

/**
 * Creates a 500 Internal Server Error.
 */
export function internalError(
  message: string = "Internal server error",
  metadata?: Record<string, unknown>
) {
  return new ConvexError({
    code: ErrorCode.INTERNAL_ERROR,
    message,
    statusCode: 500,
    metadata,
  });
}
