/**
 * Unit tests for authentication and authorization guards
 * 
 * Tests: requireAuth, requireAccountMember, requireAccountAdmin, requireAccountOwner
 * Coverage: lib/auth.ts (security-critical authentication/authorization logic)
 */

import { describe, it, expect } from "vitest";
import {
  requireAuth,
  requireAccountMember,
  requireAccountAdmin,
  requireAccountOwner,
} from "./auth";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Mock Context Helpers
// ============================================================================

function createMockAuthContext(identity: any) {
  return {
    auth: {
      getUserIdentity: async () => identity,
    },
    db: {
      get: async (id: Id<any>) => null,
      query: () => ({
        withIndex: () => ({
          unique: async () => null,
        }),
      }),
    },
  } as any;
}

function createMockDbContext(dbData: {
  accounts?: Record<string, any>;
  memberships?: any[];
}) {
  return {
    auth: {
      getUserIdentity: async () => ({
        subject: "user_test123",
        name: "Test User",
        email: "test@example.com",
      }),
    },
    db: {
      get: async (id: Id<any>) => {
        if (dbData.accounts && dbData.accounts[id as string]) {
          return dbData.accounts[id as string];
        }
        return null;
      },
      query: (table: string) => ({
        withIndex: (indexName: string, fn: Function) => ({
          unique: async () => {
            if (table === "memberships" && dbData.memberships) {
              return dbData.memberships[0] || null;
            }
            return null;
          },
        }),
      }),
    },
  } as any;
}

// ============================================================================
// requireAuth Tests
// ============================================================================

describe("requireAuth", () => {
  it("should return auth context when identity exists", async () => {
    const mockIdentity = {
      subject: "user_123",
      name: "Alice",
      email: "alice@example.com",
      pictureUrl: "https://example.com/avatar.jpg",
    };

    const ctx = createMockAuthContext(mockIdentity);
    const authContext = await requireAuth(ctx);

    expect(authContext.userId).toBe("user_123");
    expect(authContext.userName).toBe("Alice");
    expect(authContext.userEmail).toBe("alice@example.com");
    expect(authContext.userAvatarUrl).toBe("https://example.com/avatar.jpg");
  });

  it("should use default name when name is missing", async () => {
    const mockIdentity = {
      subject: "user_456",
      name: null,
      email: "bob@example.com",
    };

    const ctx = createMockAuthContext(mockIdentity);
    const authContext = await requireAuth(ctx);

    expect(authContext.userName).toBe("Unknown");
  });

  it("should use empty string when email is missing", async () => {
    const mockIdentity = {
      subject: "user_789",
      name: "Charlie",
      email: null,
    };

    const ctx = createMockAuthContext(mockIdentity);
    const authContext = await requireAuth(ctx);

    expect(authContext.userEmail).toBe("");
  });

  it("should throw error when no identity is present", async () => {
    const ctx = createMockAuthContext(null);

    await expect(requireAuth(ctx)).rejects.toThrow(
      "Unauthenticated: No valid identity found"
    );
  });
});

// ============================================================================
// requireAccountMember Tests
// ============================================================================

describe("requireAccountMember", () => {
  it("should return account member context when user is a member", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const mockAccount = {
      _id: accountId,
      name: "Test Account",
      slug: "test-account",
    };
    const mockMembership = {
      _id: "membership_test" as Id<"memberships">,
      userId: "user_test123",
      accountId,
      role: "member",
    };

    const ctx = createMockDbContext({
      accounts: { [accountId]: mockAccount },
      memberships: [mockMembership],
    });

    const memberContext = await requireAccountMember(ctx, accountId);

    expect(memberContext.accountId).toBe(accountId);
    expect(memberContext.account).toEqual(mockAccount);
    expect(memberContext.membership).toEqual(mockMembership);
    expect(memberContext.userId).toBe("user_test123");
  });

  it("should throw error when account does not exist", async () => {
    const accountId = "nonexistent_account" as Id<"accounts">;
    const ctx = createMockDbContext({});

    await expect(requireAccountMember(ctx, accountId)).rejects.toThrow(
      "Not found: Account does not exist"
    );
  });

  it("should throw error when user is not a member", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const mockAccount = {
      _id: accountId,
      name: "Test Account",
      slug: "test-account",
    };

    const ctx = createMockDbContext({
      accounts: { [accountId]: mockAccount },
      memberships: [], // No membership
    });

    await expect(requireAccountMember(ctx, accountId)).rejects.toThrow(
      "Forbidden: User is not a member of this account"
    );
  });

  it("should throw error when user is not authenticated", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const ctx = createMockAuthContext(null);
    ctx.db = {
      get: async () => null,
      query: () => ({ withIndex: () => ({ unique: async () => null }) }),
    };

    await expect(requireAccountMember(ctx, accountId)).rejects.toThrow(
      "Unauthenticated"
    );
  });
});

// ============================================================================
// requireAccountAdmin Tests
// ============================================================================

describe("requireAccountAdmin", () => {
  it("should allow admin role", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const mockAccount = {
      _id: accountId,
      name: "Test Account",
      slug: "test-account",
    };
    const mockMembership = {
      _id: "membership_test" as Id<"memberships">,
      userId: "user_test123",
      accountId,
      role: "admin",
    };

    const ctx = createMockDbContext({
      accounts: { [accountId]: mockAccount },
      memberships: [mockMembership],
    });

    const adminContext = await requireAccountAdmin(ctx, accountId);

    expect(adminContext.membership.role).toBe("admin");
  });

  it("should allow owner role", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const mockAccount = {
      _id: accountId,
      name: "Test Account",
      slug: "test-account",
    };
    const mockMembership = {
      _id: "membership_test" as Id<"memberships">,
      userId: "user_test123",
      accountId,
      role: "owner",
    };

    const ctx = createMockDbContext({
      accounts: { [accountId]: mockAccount },
      memberships: [mockMembership],
    });

    const adminContext = await requireAccountAdmin(ctx, accountId);

    expect(adminContext.membership.role).toBe("owner");
  });

  it("should reject member role", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const mockAccount = {
      _id: accountId,
      name: "Test Account",
      slug: "test-account",
    };
    const mockMembership = {
      _id: "membership_test" as Id<"memberships">,
      userId: "user_test123",
      accountId,
      role: "member",
    };

    const ctx = createMockDbContext({
      accounts: { [accountId]: mockAccount },
      memberships: [mockMembership],
    });

    await expect(requireAccountAdmin(ctx, accountId)).rejects.toThrow(
      "Forbidden"
    );
  });
});

// ============================================================================
// requireAccountOwner Tests
// ============================================================================

describe("requireAccountOwner", () => {
  it("should allow owner role", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const mockAccount = {
      _id: accountId,
      name: "Test Account",
      slug: "test-account",
    };
    const mockMembership = {
      _id: "membership_test" as Id<"memberships">,
      userId: "user_test123",
      accountId,
      role: "owner",
    };

    const ctx = createMockDbContext({
      accounts: { [accountId]: mockAccount },
      memberships: [mockMembership],
    });

    const ownerContext = await requireAccountOwner(ctx, accountId);

    expect(ownerContext.membership.role).toBe("owner");
  });

  it("should reject admin role", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const mockAccount = {
      _id: accountId,
      name: "Test Account",
      slug: "test-account",
    };
    const mockMembership = {
      _id: "membership_test" as Id<"memberships">,
      userId: "user_test123",
      accountId,
      role: "admin",
    };

    const ctx = createMockDbContext({
      accounts: { [accountId]: mockAccount },
      memberships: [mockMembership],
    });

    await expect(requireAccountOwner(ctx, accountId)).rejects.toThrow(
      "Forbidden"
    );
  });

  it("should reject member role", async () => {
    const accountId = "account_test" as Id<"accounts">;
    const mockAccount = {
      _id: accountId,
      name: "Test Account",
      slug: "test-account",
    };
    const mockMembership = {
      _id: "membership_test" as Id<"memberships">,
      userId: "user_test123",
      accountId,
      role: "member",
    };

    const ctx = createMockDbContext({
      accounts: { [accountId]: mockAccount },
      memberships: [mockMembership],
    });

    await expect(requireAccountOwner(ctx, accountId)).rejects.toThrow(
      "Forbidden"
    );
  });
});
