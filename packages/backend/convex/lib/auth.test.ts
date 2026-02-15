import { describe, it, expect, beforeEach } from "vitest";
import {
  requireAuth,
  requireAccountMember,
  requireAccountAdmin,
  requireAccountOwner,
  getAccountMembership,
} from "./auth";
import { AccountFactory, MembershipFactory } from "../__tests__/factories";
import { Id } from "../_generated/dataModel";

describe("lib/auth", () => {
  describe("requireAuth", () => {
    it("should return auth context when valid identity exists", async () => {
      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Test User",
            email: "test@example.com",
            pictureUrl: "https://example.com/avatar.jpg",
          }),
        },
      };

      const result = await requireAuth(mockCtx);

      expect(result).toEqual({
        userId: "user_123",
        userName: "Test User",
        userEmail: "test@example.com",
        userAvatarUrl: "https://example.com/avatar.jpg",
      });
    });

    it("should throw when no identity is present", async () => {
      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => null,
        },
      };

      await expect(requireAuth(mockCtx)).rejects.toThrow(
        "Unauthenticated: No valid identity found"
      );
    });

    it("should handle missing optional fields", async () => {
      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            // name and email missing
          }),
        },
      };

      const result = await requireAuth(mockCtx);

      expect(result.userId).toBe("user_123");
      expect(result.userName).toBe("Unknown");
      expect(result.userEmail).toBe("");
      expect(result.userAvatarUrl).toBeUndefined();
    });
  });

  describe("requireAccountMember", () => {
    it("should return account member context when user is a member", async () => {
      const account = AccountFactory.create();
      const membership = MembershipFactory.create({
        accountId: account._id,
        userId: "user_123",
        role: "member",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account._id) return account;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => membership,
            }),
          }),
        },
      };

      const result = await requireAccountMember(mockCtx, account._id);

      expect(result.userId).toBe("user_123");
      expect(result.accountId).toBe(account._id);
      expect(result.membership).toEqual(membership);
      expect(result.account).toEqual(account);
    });

    it("should throw when account does not exist", async () => {
      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async () => null,
        },
      };

      await expect(
        requireAccountMember(mockCtx, "invalid_account_id" as any)
      ).rejects.toThrow("Not found: Account does not exist");
    });

    it("should throw when user is not a member", async () => {
      const account = AccountFactory.create();

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account._id) return account;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => null, // No membership found
            }),
          }),
        },
      };

      await expect(
        requireAccountMember(mockCtx, account._id)
      ).rejects.toThrow("Forbidden: User is not a member of this account");
    });

    it("should prevent cross-account access", async () => {
      const account1 = AccountFactory.create({ name: "Account 1" });
      const account2 = AccountFactory.create({ name: "Account 2" });
      const membership1 = MembershipFactory.create({
        accountId: account1._id,
        userId: "user_123",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account2._id) return account2;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => null, // User has membership in account1, not account2
            }),
          }),
        },
      };

      await expect(
        requireAccountMember(mockCtx, account2._id)
      ).rejects.toThrow("Forbidden: User is not a member of this account");
    });
  });

  describe("requireAccountAdmin", () => {
    it("should return context when user is an admin", async () => {
      const account = AccountFactory.create();
      const membership = MembershipFactory.create({
        accountId: account._id,
        userId: "user_123",
        role: "admin",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Admin User",
            email: "admin@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account._id) return account;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => membership,
            }),
          }),
        },
      };

      const result = await requireAccountAdmin(mockCtx, account._id);

      expect(result.membership.role).toBe("admin");
    });

    it("should return context when user is an owner", async () => {
      const account = AccountFactory.create();
      const membership = MembershipFactory.create({
        accountId: account._id,
        userId: "user_123",
        role: "owner",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Owner User",
            email: "owner@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account._id) return account;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => membership,
            }),
          }),
        },
      };

      const result = await requireAccountAdmin(mockCtx, account._id);

      expect(result.membership.role).toBe("owner");
    });

    it("should throw when user is only a member", async () => {
      const account = AccountFactory.create();
      const membership = MembershipFactory.create({
        accountId: account._id,
        userId: "user_123",
        role: "member",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Member User",
            email: "member@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account._id) return account;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => membership,
            }),
          }),
        },
      };

      await expect(
        requireAccountAdmin(mockCtx, account._id)
      ).rejects.toThrow("Forbidden: Admin or owner role required");
    });
  });

  describe("requireAccountOwner", () => {
    it("should return context when user is the owner", async () => {
      const account = AccountFactory.create();
      const membership = MembershipFactory.create({
        accountId: account._id,
        userId: "user_123",
        role: "owner",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Owner User",
            email: "owner@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account._id) return account;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => membership,
            }),
          }),
        },
      };

      const result = await requireAccountOwner(mockCtx, account._id);

      expect(result.membership.role).toBe("owner");
    });

    it("should throw when user is an admin but not owner", async () => {
      const account = AccountFactory.create();
      const membership = MembershipFactory.create({
        accountId: account._id,
        userId: "user_123",
        role: "admin",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Admin User",
            email: "admin@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account._id) return account;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => membership,
            }),
          }),
        },
      };

      await expect(
        requireAccountOwner(mockCtx, account._id)
      ).rejects.toThrow("Forbidden: Owner role required");
    });

    it("should throw when user is only a member", async () => {
      const account = AccountFactory.create();
      const membership = MembershipFactory.create({
        accountId: account._id,
        userId: "user_123",
        role: "member",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Member User",
            email: "member@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === account._id) return account;
            return null;
          },
          query: () => ({
            withIndex: () => ({
              unique: async () => membership,
            }),
          }),
        },
      };

      await expect(
        requireAccountOwner(mockCtx, account._id)
      ).rejects.toThrow("Forbidden: Owner role required");
    });
  });

  describe("getAccountMembership", () => {
    it("should return membership when user is a member", async () => {
      const account = AccountFactory.create();
      const membership = MembershipFactory.create({
        accountId: account._id,
        userId: "user_123",
      });

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          query: () => ({
            withIndex: () => ({
              unique: async () => membership,
            }),
          }),
        },
      };

      const result = await getAccountMembership(mockCtx, account._id);

      expect(result).toEqual(membership);
    });

    it("should return null when user is not a member", async () => {
      const account = AccountFactory.create();

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: "user_123",
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          query: () => ({
            withIndex: () => ({
              unique: async () => null,
            }),
          }),
        },
      };

      const result = await getAccountMembership(mockCtx, account._id);

      expect(result).toBeNull();
    });

    it("should throw when user is not authenticated", async () => {
      const account = AccountFactory.create();

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => null,
        },
      };

      await expect(
        getAccountMembership(mockCtx, account._id)
      ).rejects.toThrow("Unauthenticated");
    });
  });
});
