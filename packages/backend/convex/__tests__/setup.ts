/**
 * convex/__tests__/setup.ts — Convex Test Environment Setup
 * 
 * Initializes the Convex testing harness and provides utilities for:
 * - Test database initialization
 * - Mock authentication context
 * - Common test helpers
 * 
 * Used by vitest.config.ts as setupFiles entry point.
 * 
 * Example usage in test files:
 * ```
 * import { createTestEnv, createTestUser } from "./setup";
 * 
 * it("creates a task", async () => {
 *   const env = await createTestEnv();
 *   const userId = createTestUser("user1@example.com");
 *   
 *   const taskId = await env.mutation(api.tasks.create, {
 *     title: "Test Task",
 *     accountId: env.testAccountId,
 *     createdBy: userId,
 *   });
 *   
 *   expect(taskId).toBeDefined();
 * });
 * ```
 */

import { beforeEach, afterEach, vi } from "vitest";
import { ConvexClient } from "convex/browser";
import type { DataModel } from "../_generated/dataModel";

/**
 * Global test environment singleton
 */
let globalTestEnv: TestEnvironment | null = null;

/**
 * Test environment context
 * Provides access to Convex client, test data, and utilities
 */
export interface TestEnvironment {
  /** Convex client for this test */
  client: ConvexClient;
  
  /** Test account ID (pre-created) */
  testAccountId: string;
  
  /** Test user ID (Clerk format) */
  testUserId: string;
  
  /** Run a mutation on the Convex backend */
  mutation<T>(
    mutation: (...args: any[]) => Promise<T>,
    args: Record<string, any>
  ): Promise<T>;
  
  /** Run a query on the Convex backend */
  query<T>(
    query: (...args: any[]) => Promise<T | null>,
    args: Record<string, any>
  ): Promise<T | null>;
  
  /** Reset database and clear all data */
  reset(): Promise<void>;
  
  /** Clean up test environment */
  cleanup(): Promise<void>;
}

/**
 * Mock authentication context for tests
 */
export interface MockAuthContext {
  subject: {
    name: string;
    email: string;
  };
  userId: string;
  accountId: string;
}

/**
 * Create a test environment with initialized Convex client
 * 
 * @returns Test environment with client and utilities
 */
export async function createTestEnv(): Promise<TestEnvironment> {
  if (globalTestEnv) {
    return globalTestEnv;
  }

  // Initialize Convex client for testing
  // Note: In a real test environment, this would connect to:
  // - A local Convex dev server
  // - Or a test deployment
  // - Or use Convex's testing utilities (if available in newer versions)
  
  const client = new ConvexClient(process.env.CONVEX_URL || "http://localhost:3210");
  
  // Create test account and user
  const testAccountId = await createTestAccount(client);
  const testUserId = createTestUserId("test-user@example.com");
  
  const env: TestEnvironment = {
    client,
    testAccountId,
    testUserId,
    
    async mutation(mutation, args) {
      // Execute mutation with test context
      // This is a placeholder - actual implementation depends on Convex test SDK
      return mutation(args);
    },
    
    async query(query, args) {
      // Execute query with test context
      // This is a placeholder - actual implementation depends on Convex test SDK
      return query(args);
    },
    
    async reset() {
      // Reset database state between tests
      // This would be implemented using Convex's test utilities
      // or a dedicated reset mutation
    },
    
    async cleanup() {
      // Cleanup test environment
      // Close client connections, clear caches, etc.
      globalTestEnv = null;
    },
  };
  
  globalTestEnv = env;
  return env;
}

/**
 * Create a test account in the database
 * 
 * @param client Convex client
 * @returns Account ID
 */
async function createTestAccount(client: ConvexClient): Promise<string> {
  // This would call a test mutation to create an account
  // For now, return a mock ID
  return "mock_account_" + Date.now();
}

/**
 * Create a test user ID (Clerk format)
 * 
 * @param email User email
 * @returns User ID
 */
export function createTestUserId(email: string): string {
  // Clerk user IDs look like: user_xxxxxxxxxxxxxxxxxxxxx
  return "user_" + Buffer.from(email).toString("base64").substring(0, 24);
}

/**
 * Create a test user with the given email
 * 
 * @param email User email
 * @param name Optional display name
 * @returns User ID
 */
export function createTestUser(email: string, name?: string): string {
  return createTestUserId(email);
}

/**
 * Create mock authentication context
 * 
 * @param userId User ID (optional, generated if not provided)
 * @param email User email
 * @returns Mock auth context
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

/**
 * Setup hook: Initialize test environment before each test
 */
beforeEach(async () => {
  // Create fresh test environment for each test
  globalTestEnv = null;
});

/**
 * Teardown hook: Clean up after each test
 */
afterEach(async () => {
  // Reset database and cleanup
  if (globalTestEnv) {
    await globalTestEnv.cleanup();
  }
});

/**
 * Export test environment for use in tests
 */
export { globalTestEnv as testEnv };
