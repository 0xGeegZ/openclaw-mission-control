/**
 * Error handling infrastructure for Convex backend.
 * Provides type-safe error codes and a unified ConvexError class.
 */

/**
 * Standardized error codes for backend operations.
 */
export enum ErrorCode {
  // Resource errors
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",

  // Authorization errors
  FORBIDDEN = "FORBIDDEN",
  UNAUTHORIZED = "UNAUTHORIZED",

  // Validation errors
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_INPUT = "INVALID_INPUT",

  // Operation errors
  INVALID_STATE = "INVALID_STATE",
  INVALID_TRANSITION = "INVALID_TRANSITION",
  OPERATION_FAILED = "OPERATION_FAILED",

  // System errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
}

/**
 * Standardized error thrown from Convex backend.
 * Provides error code, message, and optional context.
 */
export class ConvexError extends Error {
  code: ErrorCode;
  statusCode: number;
  context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ConvexError";
    this.code = code;
    this.context = context;

    // Map error codes to HTTP status codes
    this.statusCode = getStatusCode(code);

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ConvexError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
    };
  }
}

/**
 * Map error codes to HTTP status codes.
 */
function getStatusCode(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.CONFLICT:
      return 409;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.INVALID_STATE:
    case ErrorCode.INVALID_TRANSITION:
      return 422;
    case ErrorCode.NOT_IMPLEMENTED:
      return 501;
    case ErrorCode.OPERATION_FAILED:
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500;
  }
}

/**
 * Assert that a value exists, throw NOT_FOUND if not.
 */
export function assertExists<T>(
  value: T | null | undefined,
  message: string = "Resource not found",
  context?: Record<string, unknown>,
): T {
  if (!value) {
    throw new ConvexError(ErrorCode.NOT_FOUND, message, context);
  }
  return value;
}

/**
 * Assert that a condition is true, throw VALIDATION_ERROR if not.
 */
export function assertTrue(
  condition: boolean,
  message: string = "Validation failed",
  context?: Record<string, unknown>,
): void {
  if (!condition) {
    throw new ConvexError(ErrorCode.VALIDATION_ERROR, message, context);
  }
}

/**
 * Assert that a value matches the expected type.
 * Safe type assertion helper.
 */
export function assertType<T>(
  value: unknown,
  typeChecker: (v: unknown) => v is T,
  message: string = "Type mismatch",
  context?: Record<string, unknown>,
): T {
  if (!typeChecker(value)) {
    throw new ConvexError(ErrorCode.INVALID_INPUT, message, context);
  }
  return value;
}

/**
 * Safe cast of string to ID type with validation.
 */
export function assertId<T extends string>(
  value: string,
  tableName: string,
  context?: Record<string, unknown>,
): T {
  // Basic validation: IDs should be non-empty strings
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new ConvexError(
      ErrorCode.INVALID_INPUT,
      `Invalid ID for table "${tableName}": expected non-empty string, got "${value}"`,
      { tableName, ...context },
    );
  }
  return value as T;
}
