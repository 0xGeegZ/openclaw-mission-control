/**
 * Unit tests for mentions listMentionCandidates query.
 *
 * The query handler is: requireAccountMember(ctx, accountId) then listCandidates(ctx, accountId).
 * Auth is tested in lib/auth.test.ts; listCandidates in lib/mentions.test.ts.
 * Here we test the composed handler logic with a shared mock context.
 */

import { describe, it, expect, vi } from "vitest";
import { requireAccountMember } from "./lib/auth";
import { listCandidates } from "./lib/mentions";
import { Id } from "./_generated/dataModel";

function createMockQueryContext(
  accountId: Id<"accounts">,
  memberships: unknown[] = [],
  agents: unknown[] = [],
) {
  const accountDoc = {
    _id: accountId,
    name: "Test Account",
    slug: "test-account",
  };
  const membership = memberships.length
    ? {
        _id: "membership_1" as Id<"memberships">,
        userId: "user_123",
        accountId,
        role: "member",
      }
    : null;

  return {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({
        subject: "user_123",
        name: "Test User",
        email: "test@example.com",
      }),
    },
    db: {
      get: vi.fn(async (id: Id<"accounts">) =>
        id === accountId ? accountDoc : null,
      ),
      query: (table: string) => ({
        withIndex: (_indexName: string, _fn: (_q: unknown) => unknown) => ({
          unique: async () => membership,
          collect: async () => {
            if (table === "memberships") return memberships;
            if (table === "agents") return agents;
            return [];
          },
        }),
      }),
    },
  } as unknown as Parameters<typeof requireAccountMember>[0];
}

describe("mentions.listMentionCandidates query (handler logic)", () => {
  it("returns users and agents after auth when user is member", async () => {
    const accountId = "account_1" as Id<"accounts">;
    const memberships = [
      {
        userId: "user_1",
        userName: "Alice",
        userEmail: "alice@example.com",
        userAvatarUrl: "https://example.com/alice.jpg",
      },
    ];
    const agents = [
      {
        _id: "agent_1" as Id<"agents">,
        name: "Squad Lead",
        slug: "squad-lead",
        accountId,
      },
    ];
    const ctx = createMockQueryContext(accountId, memberships, agents);

    await requireAccountMember(ctx, accountId);
    const result = await listCandidates(ctx, accountId);

    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("agents");
    expect(result.users).toHaveLength(1);
    expect(result.agents).toHaveLength(1);
    expect(result.users[0]).toEqual({
      id: "user_1",
      name: "Alice",
      email: "alice@example.com",
      avatarUrl: "https://example.com/alice.jpg",
    });
    expect(result.agents[0]).toEqual({
      id: "agent_1",
      name: "Squad Lead",
      slug: "squad-lead",
    });
  });

  it("throws when user is not a member (auth enforced before listCandidates)", async () => {
    const accountId = "account_1" as Id<"accounts">;
    const ctx = createMockQueryContext(accountId, [], []);

    await expect(requireAccountMember(ctx, accountId)).rejects.toThrow(
      "Forbidden: User is not a member of this account",
    );
  });

  it("returns empty users and agents for member with empty workspace", async () => {
    const accountId = "account_1" as Id<"accounts">;
    const memberships = [
      { userId: "user_1", userName: "Alice", userEmail: "a@b.com" },
    ];
    const ctx = createMockQueryContext(accountId, memberships, []);

    await requireAccountMember(ctx, accountId);
    const result = await listCandidates(ctx, accountId);

    expect(result.users).toHaveLength(1);
    expect(result.agents).toHaveLength(0);
  });
});
