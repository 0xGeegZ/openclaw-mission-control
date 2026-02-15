/**
 * Unit tests for mentions helper functions and mention resolution
 *
 * Tests: extractMentionStrings, resolveMentions, getAllMentions, listCandidates
 * Coverage: lib/mentions.ts (mention parsing and resolution logic)
 */

import { describe, it, expect } from "vitest";
import {
  extractMentionStrings,
  hasAllMention,
  resolveMentions,
  getAllMentions,
  listCandidates,
} from "./mentions";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Mock Context Helpers
// ============================================================================

function createMockQueryContext(
  memberships: any[] = [],
  agents: any[] = [],
  accountDoc: {
    _id: Id<"accounts">;
    settings?: { orchestratorAgentId?: Id<"agents"> };
  } | null = null,
) {
  return {
    db: {
      query: (table: string) => ({
        withIndex: (_indexName: string, _fn: (_q: unknown) => unknown) => ({
          collect: async () => {
            if (table === "memberships") return memberships;
            if (table === "agents") return agents;
            return [];
          },
        }),
      }),
      get: async (id: Id<"accounts">) =>
        accountDoc && id === accountDoc._id ? accountDoc : null,
    },
  } as any;
}

// ============================================================================
// extractMentionStrings Tests
// ============================================================================

describe("extractMentionStrings", () => {
  it("should extract simple @username mentions", () => {
    const content = "Hey @alice and @bob, check this out";
    const mentions = extractMentionStrings(content);
    expect(mentions).toContain("alice");
    expect(mentions).toContain("bob");
  });

  it("should extract mentions with hyphens", () => {
    const content = "@squad-lead please review this";
    const mentions = extractMentionStrings(content);
    expect(mentions).toContain("squad-lead");
  });

  it("should extract quoted mentions", () => {
    const content = '@"Alice Smith" and @"Bob Jones"';
    const mentions = extractMentionStrings(content);
    expect(mentions).toContain("alice smith");
    expect(mentions).toContain("bob jones");
  });

  it("should ignore mentions in code blocks", () => {
    const content = "Here's code: ```\n@hidden\n```\nAnd @visible";
    const mentions = extractMentionStrings(content);
    expect(mentions).toContain("visible");
    expect(mentions).not.toContain("hidden");
  });

  it("should ignore mentions in inline code", () => {
    const content = "Use `@private` or call @alice";
    const mentions = extractMentionStrings(content);
    expect(mentions).toContain("alice");
    expect(mentions).not.toContain("private");
  });

  it("should ignore mentions in quoted lines", () => {
    const content = "> Original: @author\nReply: @responder";
    const mentions = extractMentionStrings(content);
    expect(mentions).toContain("responder");
    expect(mentions).not.toContain("author");
  });

  it("should be case-insensitive", () => {
    const content = "@Alice @BOB @CamelCase";
    const mentions = extractMentionStrings(content);
    expect(mentions).toContain("alice");
    expect(mentions).toContain("bob");
    expect(mentions).toContain("camelcase");
  });
});

// ============================================================================
// hasAllMention Tests
// ============================================================================

describe("hasAllMention", () => {
  it("should detect @all mention", () => {
    expect(hasAllMention("@all please review")).toBe(true);
    expect(hasAllMention("Hey @all!")).toBe(true);
  });

  it("should be case-insensitive", () => {
    expect(hasAllMention("@ALL team")).toBe(true);
    expect(hasAllMention("@All please help")).toBe(true);
  });

  it("should not match @all in code blocks", () => {
    expect(hasAllMention("Code: ```@all```")).toBe(false);
  });

  it("should not match @all in quoted content", () => {
    expect(hasAllMention("> @all says hello\nNew: @alice")).toBe(false);
  });

  it("should return false when @all not present", () => {
    expect(hasAllMention("@alice and @bob")).toBe(false);
  });
});

// ============================================================================
// resolveMentions Tests
// ============================================================================

describe("resolveMentions", () => {
  it("should resolve user mentions by name", async () => {
    const mockCtx = createMockQueryContext(
      [
        {
          userId: "user_1",
          userName: "Alice",
          userEmail: "alice@example.com",
        },
      ],
      [],
    );

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      ["alice"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("user");
    expect(result[0].name).toBe("Alice");
  });

  it("should resolve user mentions by email prefix", async () => {
    const mockCtx = createMockQueryContext(
      [
        {
          userId: "user_1",
          userName: "Alice Smith",
          userEmail: "alice.smith@example.com",
        },
      ],
      [],
    );

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      ["alice.smith"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("user");
  });

  it("should resolve agent mentions by slug", async () => {
    const mockCtx = createMockQueryContext(
      [],
      [
        {
          _id: "agent_1" as Id<"agents">,
          name: "Squad Lead",
          slug: "squad-lead",
          accountId: "account_1" as Id<"accounts">,
        },
      ],
    );

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      ["squad-lead"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("agent");
    expect(result[0].slug).toBe("squad-lead");
  });

  it("should resolve agent slug mentions from content when followed by sentence text", async () => {
    const mockCtx = createMockQueryContext(
      [],
      [
        {
          _id: "agent_1" as Id<"agents">,
          name: "Squad Lead",
          slug: "squad-lead",
          accountId: "account_1" as Id<"accounts">,
        },
      ],
    );

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      {
        content: "@squad-lead please answer engineer for the next steps",
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("agent");
    expect(result[0].slug).toBe("squad-lead");
  });

  it("should skip unresolved mentions", async () => {
    const mockCtx = createMockQueryContext([], []);

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      ["nonexistent", "also-missing"],
    );

    expect(result).toHaveLength(0);
  });

  it("should be case-insensitive for user names", async () => {
    const mockCtx = createMockQueryContext(
      [
        {
          userId: "user_1",
          userName: "Alice",
          userEmail: "alice@example.com",
        },
      ],
      [],
    );

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      ["ALICE"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  it("should resolve @qa by slug when agent has slug qa", async () => {
    const mockCtx = createMockQueryContext(
      [],
      [
        {
          _id: "agent_qa" as Id<"agents">,
          name: "QA",
          slug: "qa",
          role: "QA / Reviewer",
          accountId: "account_1" as Id<"accounts">,
        },
      ],
    );

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      ["qa"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("agent");
    expect(result[0].name).toBe("QA");
    expect(result[0].slug).toBe("qa");
  });

  it("should resolve @qa by role when no agent has slug/name qa but one has QA role", async () => {
    const mockCtx = createMockQueryContext(
      [],
      [
        {
          _id: "agent_qa" as Id<"agents">,
          name: "QA Reviewer",
          slug: "qa-reviewer",
          role: "QA / Reviewer",
          accountId: "account_1" as Id<"accounts">,
        },
      ],
    );

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      ["qa"],
    );

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("agent");
    expect(result[0].name).toBe("QA Reviewer");
    expect(result[0].slug).toBe("qa");
  });

  it("should resolve unquoted full-name mention from content using longest prefix", async () => {
    const mockCtx = createMockQueryContext(
      [
        {
          userId: "user_1",
          userName: "guillaume dieudonne",
          userEmail: "guillaume@example.com",
        },
      ],
      [],
    );

    const result = await resolveMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      {
        mentionStrings: ["guillaume"],
        content: "Awaiting approval from **@guillaume dieudonne before merge**",
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "user",
      id: "user_1",
      name: "guillaume dieudonne",
    });
  });
});

// ============================================================================
// getAllMentions Tests
// ============================================================================

describe("getAllMentions", () => {
  it("should return all members and agents", async () => {
    const mockCtx = createMockQueryContext(
      [
        {
          userId: "user_1",
          userName: "Alice",
          userEmail: "alice@example.com",
        },
        {
          userId: "user_2",
          userName: "Bob",
          userEmail: "bob@example.com",
        },
      ],
      [
        {
          _id: "agent_1" as Id<"agents">,
          name: "Squad Lead",
          slug: "squad-lead",
          accountId: "account_1" as Id<"accounts">,
        },
      ],
    );

    const result = await getAllMentions(mockCtx, "account_1" as Id<"accounts">);

    expect(result).toHaveLength(3);
    expect(result.filter((m) => m.type === "user")).toHaveLength(2);
    expect(result.filter((m) => m.type === "agent")).toHaveLength(1);
  });

  it("should exclude author when provided", async () => {
    const mockCtx = createMockQueryContext(
      [
        {
          userId: "user_1",
          userName: "Alice",
          userEmail: "alice@example.com",
        },
        {
          userId: "user_2",
          userName: "Bob",
          userEmail: "bob@example.com",
        },
      ],
      [],
    );

    const result = await getAllMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      "user_1",
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Bob");
  });

  it("should exclude author agent when provided", async () => {
    const mockCtx = createMockQueryContext(
      [],
      [
        {
          _id: "agent_1" as Id<"agents">,
          name: "Agent 1",
          slug: "agent-1",
          accountId: "account_1" as Id<"accounts">,
        },
        {
          _id: "agent_2" as Id<"agents">,
          name: "Agent 2",
          slug: "agent-2",
          accountId: "account_1" as Id<"accounts">,
        },
      ],
    );

    const result = await getAllMentions(
      mockCtx,
      "account_1" as Id<"accounts">,
      "agent_1",
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Agent 2");
  });
});

// ============================================================================
// listCandidates Tests
// ============================================================================

describe("listCandidates", () => {
  it("should return users and agents grouped by type", async () => {
    const mockCtx = createMockQueryContext(
      [
        {
          userId: "user_1",
          userName: "Alice",
          userEmail: "alice@example.com",
          userAvatarUrl: "https://example.com/alice.jpg",
        },
      ],
      [
        {
          _id: "agent_1" as Id<"agents">,
          name: "Squad Lead",
          slug: "squad-lead",
          accountId: "account_1" as Id<"accounts">,
        },
      ],
    );

    const result = await listCandidates(mockCtx, "account_1" as Id<"accounts">);

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

  it("should return empty arrays for new account", async () => {
    const mockCtx = createMockQueryContext([], []);

    const result = await listCandidates(mockCtx, "account_1" as Id<"accounts">);

    expect(result.users).toHaveLength(0);
    expect(result.agents).toHaveLength(0);
  });

  it("should include optional avatarUrl field", async () => {
    const mockCtx = createMockQueryContext(
      [
        {
          userId: "user_1",
          userName: "Alice",
          userEmail: "alice@example.com",
          userAvatarUrl: undefined,
        },
      ],
      [],
    );

    const result = await listCandidates(mockCtx, "account_1" as Id<"accounts">);

    expect(result.users[0]).toHaveProperty("avatarUrl");
    expect(result.users[0].avatarUrl).toBeUndefined();
  });
});
