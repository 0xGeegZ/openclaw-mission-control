/**
 * Consolidated validation helpers for Convex mutations.
 * Extracts common validation patterns across agents, tasks, and memberships.
 */

import { ConvexError, ErrorCode } from "./errors";

/**
 * Base shape for createable resources.
 */
export interface Createable {
  accountId: any;
  createdAt: number;
  updatedAt: number;
}

/**
 * Validation result with optional context.
 */
export interface ValidationResult {
  isValid: boolean;
  error?: {
    code: ErrorCode;
    message: string;
    context?: Record<string, unknown>;
  };
}

/**
 * Validates that a resource belongs to the expected account.
 */
export function validateAccountOwnership<T extends { accountId: any }>(
  resource: T,
  expectedAccountId: any,
  resourceType: string,
): ValidationResult {
  if (resource.accountId !== expectedAccountId) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.FORBIDDEN,
        message: `${resourceType} belongs to different account`,
        context: { expectedAccountId, actualAccountId: resource.accountId },
      },
    };
  }

  return { isValid: true };
}

/**
 * Validates that a string is non-empty and within length limits.
 */
export function validateStringField(
  value: string | undefined,
  fieldName: string,
  minLength: number = 1,
  maxLength: number = 1000,
): ValidationResult {
  if (!value || value.trim().length < minLength) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: `${fieldName} must be at least ${minLength} character(s)`,
        context: { fieldName, value, minLength },
      },
    };
  }

  if (value.length > maxLength) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: `${fieldName} must not exceed ${maxLength} character(s)`,
        context: { fieldName, length: value.length, maxLength },
      },
    };
  }

  return { isValid: true };
}

/**
 * Validates that an array is not empty.
 */
export function validateArrayNotEmpty<T>(
  array: T[] | undefined,
  fieldName: string,
): ValidationResult {
  if (!array || array.length === 0) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: `${fieldName} must contain at least one item`,
        context: { fieldName },
      },
    };
  }

  return { isValid: true };
}

/**
 * Validates that an ID reference exists and is valid.
 */
export async function validateIdReference(
  ctx: any,
  tableName: string,
  docId: any,
  fieldName: string = tableName,
): Promise<ValidationResult> {
  const doc = await ctx.db.get(docId);
  if (!doc) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.NOT_FOUND,
        message: `Referenced ${fieldName} does not exist`,
        context: { [fieldName]: docId },
      },
    };
  }

  return { isValid: true };
}

/**
 * Validates that a value is one of the allowed enum values.
 */
export function validateEnumValue<T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  fieldName: string,
): ValidationResult {
  if (!allowedValues.includes(value as any)) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: `${fieldName} must be one of: ${allowedValues.join(", ")}`,
        context: { fieldName, value, allowedValues },
      },
    };
  }

  return { isValid: true };
}

/**
 * Throws ConvexError if validation fails.
 */
export function throwIfInvalid(result: ValidationResult): void {
  if (!result.isValid && result.error) {
    throw new ConvexError(
      result.error.code,
      result.error.message,
      result.error.context,
    );
  }
}

/**
 * Chains multiple validations, throws on first failure.
 */
export function chainValidations(...results: ValidationResult[]): void {
  for (const result of results) {
    throwIfInvalid(result);
  }
}

/**
 * Common validation schema for creating agents.
 */
export interface CreateAgentValidation {
  slug: string;
  name?: string;
  accountId: any;
}

export function validateCreateAgent(data: CreateAgentValidation): ValidationResult[] {
  return [
    validateStringField(data.slug, "slug", 3, 50),
    data.name ? validateStringField(data.name, "name", 1, 100) : { isValid: true },
  ];
}

/**
 * Common validation schema for creating tasks.
 */
export interface CreateTaskValidation {
  title: string;
  accountId: any;
  description?: string;
}

export function validateCreateTask(data: CreateTaskValidation): ValidationResult[] {
  return [
    validateStringField(data.title, "title", 1, 500),
    data.description ? validateStringField(data.description, "description", 0, 10000) : { isValid: true },
  ];
}

/**
 * Validates that a document has been modified (for update operations).
 */
export function validateHasChanges<T extends Record<string, any>>(
  original: T,
  updates: Partial<T>,
  fieldsToCheck?: (keyof T)[],
): ValidationResult {
  const fields = fieldsToCheck || Object.keys(updates) as (keyof T)[];

  for (const field of fields) {
    if (field in updates && updates[field] !== original[field]) {
      return { isValid: true };
    }
  }

  return {
    isValid: false,
    error: {
      code: ErrorCode.VALIDATION_ERROR,
      message: "No changes detected in update",
      context: { providedFields: Object.keys(updates) },
    },
  };
}

/**
 * Validates timestamp consistency (updatedAt > createdAt).
 */
export function validateTimestamps(
  createdAt: number,
  updatedAt: number,
): ValidationResult {
  if (updatedAt < createdAt) {
    return {
      isValid: false,
      error: {
        code: ErrorCode.INVALID_INPUT,
        message: "updatedAt cannot be before createdAt",
        context: { createdAt, updatedAt },
      },
    };
  }

  return { isValid: true };
}
