/**
 * Assertion helpers for type-safe validation in Convex mutations/queries.
 * These utilities provide consistent, type-safe ways to validate conditions
 * and throw ConvexError when assertions fail.
 */

import {
  ConvexError,
  ErrorCode,
  validationError,
  unauthorizedError,
  notFoundError,
  forbiddenError,
  conflictError,
} from "./errors";

/**
 * Asserts that a condition is true, throwing a validation error if not.
 *
 * @example
 * assertTruthy(user, "User not found");
 * assertTruthy(user.isActive, "User is not active");
 */
export function assertTruthy<T>(
  value: T | null | undefined,
  message: string
): asserts value is T {
  if (!value) {
    throw validationError(message);
  }
}

/**
 * Asserts that a condition is true, throwing a ConvexError if not.
 *
 * @example
 * assertTrue(value === expectedValue, "Value mismatch", ErrorCode.CONFLICT);
 */
export function assertTrue(
  condition: boolean,
  message: string,
  code: ErrorCode = ErrorCode.VALIDATION_ERROR,
  statusCode?: number
): asserts condition {
  if (!condition) {
    throw new ConvexError({
      code,
      message,
      statusCode: statusCode || (code === ErrorCode.VALIDATION_ERROR ? 400 : 500),
    });
  }
}

/**
 * Asserts that a value is not null or undefined (existence check).
 *
 * @example
 * const user = assertDefined(userDoc, "User not found");
 * // user is now known to be non-null
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw notFoundError(message);
  }
}

/**
 * Asserts that two values are equal, throwing a conflict error if not.
 *
 * @example
 * assertEqual(user.accountId, expectedAccountId, "Account mismatch");
 */
export function assertEqual<T>(
  actual: T,
  expected: T,
  message: string
): asserts actual is T {
  if (actual !== expected) {
    throw conflictError(message);
  }
}

/**
 * Asserts that a string is not empty after trimming.
 *
 * @example
 * assertNonEmptyString(title, "Title is required");
 */
export function assertNonEmptyString(
  value: string | null | undefined,
  message: string
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError(message);
  }
}

/**
 * Asserts that an array is not empty.
 *
 * @example
 * assertNonEmptyArray(items, "At least one item is required");
 */
export function assertNonEmptyArray<T>(
  value: T[] | null | undefined,
  message: string
): asserts value is T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw validationError(message);
  }
}

/**
 * Asserts that a user is authenticated (has a userId in context).
 *
 * @example
 * const userId = assertAuthenticated(ctx, "User must be authenticated");
 */
export function assertAuthenticated(
  userId: string | null,
  message: string = "User must be authenticated"
): asserts userId is string {
  if (!userId) {
    throw unauthorizedError(message);
  }
}

/**
 * Asserts that a user has a specific permission/role.
 *
 * @example
 * assertAuthorized(user.role === "admin", "Admin access required");
 */
export function assertAuthorized(
  condition: boolean,
  message: string = "User is not authorized"
): asserts condition {
  if (!condition) {
    throw forbiddenError(message);
  }
}

/**
 * Asserts that a resource exists (not null/undefined).
 *
 * @example
 * const doc = assertExists(await db.get(id), "Document not found");
 */
export function assertExists<T>(
  value: T | null | undefined,
  message: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw notFoundError(message);
  }
}

/**
 * Asserts that a value matches a predicate, with custom error code.
 *
 * @example
 * assertMatches(
 *   user.status === "active",
 *   "User must be active",
 *   ErrorCode.INVALID_STATE
 * );
 */
export function assertMatches(
  condition: boolean,
  message: string,
  code: ErrorCode = ErrorCode.VALIDATION_ERROR
): asserts condition {
  if (!condition) {
    const statusCodeMap: Record<ErrorCode, number> = {
      [ErrorCode.UNAUTHORIZED]: 401,
      [ErrorCode.FORBIDDEN]: 403,
      [ErrorCode.NOT_FOUND]: 404,
      [ErrorCode.CONFLICT]: 409,
      [ErrorCode.QUOTA_EXCEEDED]: 429,
      [ErrorCode.INVALID_INPUT]: 400,
      [ErrorCode.VALIDATION_ERROR]: 400,
      [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
      [ErrorCode.INVALID_STATE]: 400,
      [ErrorCode.OPERATION_NOT_ALLOWED]: 400,
      [ErrorCode.DATABASE_ERROR]: 500,
      [ErrorCode.CONCURRENT_MODIFICATION]: 409,
      [ErrorCode.REFERENCE_NOT_FOUND]: 404,
      [ErrorCode.EXTERNAL_SERVICE_ERROR]: 503,
      [ErrorCode.TIMEOUT]: 504,
      [ErrorCode.INTERNAL_ERROR]: 500,
      [ErrorCode.SERVICE_UNAVAILABLE]: 503,
    };

    throw new ConvexError({
      code,
      message,
      statusCode: statusCodeMap[code],
    });
  }
}

/**
 * Validates an ID is properly formatted (truthy).
 *
 * @example
 * const accountId = assertValidId(args.accountId, "Invalid account ID");
 */
export function assertValidId<T extends string>(
  id: T | null | undefined,
  message: string
): asserts id is T {
  if (!id) {
    throw validationError(message);
  }
}

/**
 * Throws a ConvexError with full control over code, message, and statusCode.
 *
 * @example
 * throw throwError(ErrorCode.QUOTA_EXCEEDED, "Monthly quota exceeded", 429);
 */
export function throwError(
  code: ErrorCode,
  message: string,
  statusCode?: number
): never {
  throw new ConvexError({ code, message, statusCode });
}

/**
 * Type guard to check if an error is a ConvexError.
 *
 * @example
 * try { ... } catch (e) {
 *   if (isConvexError(e)) {
 *     log(`Error: ${e.code} - ${e.message}`);
 *   }
 * }
 */
export function isConvexError(error: unknown): error is ConvexError {
  return ConvexError.isConvexError(error);
}
