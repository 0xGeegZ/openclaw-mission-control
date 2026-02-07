/**
 * Convex Test Environment Setup (lives outside convex/ so Convex deploy does not load vitest).
 * Location: packages/backend/__tests__/setup.ts
 *
 * Used by vitest.config.ts as setupFiles entry point.
 *
 * Example usage in test files:
 * ```
 * import { createTestEnv, createTestUser } from "../__tests__/setup";
 * ```
 */

import { beforeEach, afterEach } from "vitest";
import { ConvexClient } from "convex/browser";

/**
 * Global test environment singleton
 */
let globalTestEnv: TestEnvironment | null = null;

/**
 * Test environment context
 */
export interface TestEnvironment {
  client: ConvexClient;
  testAccountId: string;
  testUserId: string;
  mutation<T>(
    mutation: (...args: unknown[]) => Promise<T>,
    args: Record<string, unknown>
  ): Promise<T>;
  query<T>(
    query: (...args: unknown[]) => Promise<T | null>,
    args: Record<string, unknown>
  ): Promise<T | null>;
  reset(): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Mock authentication context for tests
 */
export interface MockAuthContext {
  subject: { name: string; email: string };
  userId: string;
  accountId: string;
}

/**
 * Create a test environment with initialized Convex client
 */
export async function createTestEnv(): Promise<TestEnvironment> {
  if (globalTestEnv) {
    return globalTestEnv;
  }

  const client = new ConvexClient(process.env.CONVEX_URL || "http://localhost:3210");
  const testAccountId = await createTestAccount(client);
  const testUserId = createTestUserId("test-user@example.com");

  const env: TestEnvironment = {
    client,
    testAccountId,
    testUserId,

    async mutation(mutation, args) {
      return mutation(args);
    },

    async query(query, args) {
      return query(args);
    },

    async reset() {
      // Placeholder
    },

    async cleanup() {
      globalTestEnv = null;
    },
  };

  globalTestEnv = env;
  return env;
}

async function createTestAccount(client: ConvexClient): Promise<string> {
  return "mock_account_" + Date.now();
}

/**
 * Create a test user ID (Clerk format)
 */
export function createTestUserId(email: string): string {
  return "user_" + Buffer.from(email).toString("base64").substring(0, 24);
}

/**
 * Create a test user with the given email
 */
export function createTestUser(email: string, _name?: string): string {
  return createTestUserId(email);
}

/**
 * Create mock authentication context
 */
export function createMockAuthContext(
  email: string,
  userId?: string
): MockAuthContext {
  return {
    subject: {
      name: email.split("@")[0],
      email,
    },
    userId: userId || createTestUserId(email),
    accountId: "mock_account_" + Date.now(),
  };
}

beforeEach(async () => {
  globalTestEnv = null;
});

afterEach(async () => {
  if (globalTestEnv) {
    await globalTestEnv.cleanup();
  }
});

export { globalTestEnv as testEnv };
