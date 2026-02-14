import { Id } from "../_generated/dataModel";

/**
 * Test factories for creating mock data objects.
 * Used in unit tests to generate realistic test data.
 */

export const AccountFactory = {
  create: (overrides?: Partial<{
    name: string;
    slug: string;
    plan: "free" | "pro" | "enterprise";
  }>) => ({
    _id: crypto.getRandomValues(new Uint8Array(16)).toString() as Id<"accounts">,
    _creationTime: Date.now(),
    name: overrides?.name ?? "Test Account",
    slug: overrides?.slug ?? "test-account",
    plan: overrides?.plan ?? "free",
    runtimeStatus: "provisioning" as const,
  }),
};

export const MembershipFactory = {
  create: (overrides?: Partial<{
    accountId: Id<"accounts">;
    userId: string;
    userName: string;
    userEmail: string;
    role: "member" | "admin" | "owner";
  }>) => ({
    _id: crypto.getRandomValues(new Uint8Array(16)).toString() as Id<"memberships">,
    _creationTime: Date.now(),
    accountId: overrides?.accountId ?? ("account_test" as Id<"accounts">),
    userId: overrides?.userId ?? "user_test",
    userName: overrides?.userName ?? "Test User",
    userEmail: overrides?.userEmail ?? "test@example.com",
    userAvatarUrl: "https://example.com/avatar.jpg",
    role: overrides?.role ?? "member",
  }),
};
