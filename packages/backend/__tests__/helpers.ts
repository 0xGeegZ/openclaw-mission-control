/**
 * Test Helpers & Utilities
 *
 * Common test utilities for backend testing (lives outside convex/ so Convex deploy does not load vitest).
 * Location: packages/backend/__tests__/helpers.ts
 *
 * Provides:
 * - Mock factory functions
 * - Assertion helpers
 * - Database transaction mocks
 */

import { vi } from "vitest";

/**
 * Mock Convex mutation context
 */
export function createMockMutationContext(overrides?: Record<string, unknown>) {
  return {
    auth: {
      userId: "user_test_" + Math.random().toString(36).substr(2, 9),
      accountId: "acc_test_" + Math.random().toString(36).substr(2, 9),
    },
    db: {
      insert: vi.fn().mockResolvedValue("mock_id"),
      patch: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
    runQuery: vi.fn().mockResolvedValue({}),
    runMutation: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

/**
 * Mock Convex query context
 */
export function createMockQueryContext(overrides?: Record<string, unknown>) {
  return {
    auth: {
      userId: "user_test_" + Math.random().toString(36).substr(2, 9),
      accountId: "acc_test_" + Math.random().toString(36).substr(2, 9),
    },
    db: {
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    },
    runQuery: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

/**
 * Create a mock database result
 */
export function createMockDbResult<T>(data: T, count = 1): { data: T; count: number } {
  return { data, count };
}

/**
 * Assert that a function requires authentication
 */
export async function assertRequiresAuth(fn: () => Promise<unknown>) {
  const contextWithoutAuth = { auth: undefined };
  try {
    await fn.call(contextWithoutAuth);
    throw new Error("Expected function to throw on missing auth");
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Expected function to throw on missing auth") {
      throw error;
    }
    return true;
  }
}

/**
 * Assert that a query respects accountId scoping
 */
export async function assertAccountIdScoping(
  queryFn: (ctx: unknown) => Promise<{ accountId?: string }[]>,
  currentAccountId: string
) {
  const ctx = createMockQueryContext();
  (ctx as { auth: { accountId: string } }).auth.accountId = currentAccountId;

  const results = await queryFn(ctx);

  results.forEach((result) => {
    if (result.accountId && result.accountId !== currentAccountId) {
      throw new Error(
        `Result leaked to different account: expected ${currentAccountId}, got ${result.accountId}`
      );
    }
  });

  return true;
}

/**
 * Common validation error messages
 */
export const ValidationErrors = {
  MISSING_AUTH: "Authentication required",
  INVALID_STATUS: "Invalid status value",
  MISSING_REQUIRED_FIELD: (field: string) => `Missing required field: ${field}`,
  UNAUTHORIZED: "Not authorized to perform this action",
  NOT_FOUND: (resource: string) => `${resource} not found`,
  ACCOUNT_ID_MISMATCH: "Account ID mismatch",
};

/**
 * Assert error thrown has specific message
 */
export function assertErrorMessage(error: unknown, expectedMessage: string) {
  const msg = error instanceof Error ? error.message : "";
  if (!msg || !msg.includes(expectedMessage)) {
    throw new Error(
      `Expected error message to include "${expectedMessage}", got: "${msg}"`
    );
  }
  return true;
}

/**
 * Wait for async operations to complete
 */
export async function waitFor(ms = 100) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create test data with minimal required fields
 */
export const TestData = {
  minimalTask: {
    title: "Task",
    status: "assigned" as const,
  },

  minimalAgent: {
    name: "Agent",
    slug: "agent",
  },

  minimalMessage: {
    content: "Message",
  },

  minimalAccount: {
    name: "Test Account",
    plan: "pro" as const,
  },
};

/**
 * Batch assertion helper
 */
export function assertAll(
  assertions: Array<{ name: string; fn: () => boolean | Promise<boolean> }>
) {
  return Promise.all(
    assertions.map(async ({ name, fn }) => {
      try {
        const result = await fn();
        if (!result) {
          throw new Error(`Assertion failed: ${name}`);
        }
        return { name, passed: true };
      } catch (error: unknown) {
        return {
          name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })
  );
}
