import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import type { Doc } from "../_generated/dataModel";
import type { RecipientType } from "@packages/shared";

/** Role/slug pattern for QA agents; aligned with service/tasks isQaAgent. */
const QA_AGENT_PATTERN = /\bqa\b|quality assurance|quality\b/i;

function isQaAgentProfile(
  agent: Pick<Doc<"agents">, "role" | "slug">,
): boolean {
  const slug = (agent.slug ?? "").toLowerCase();
  if (slug === "qa") return true;
  return QA_AGENT_PATTERN.test(agent.role ?? "");
}

/**
 * Parsed mention with resolved entity.
 * slug is set for agents so the UI can match @slug in content (e.g. @squad-lead).
 */
export interface ParsedMention {
  type: RecipientType;
  id: string;
  name: string;
  slug?: string;
}

/**
 * Parse mentions from message content.
 * Supports: @username, @user-name, @"full name", @agentslug, @all
 *
 * @param content - Message content
 * @returns Array of mention strings (unresolved)
 */
export function extractMentionStrings(content: string): string[] {
  const pattern = /@(\w+(?:-\w+)*|"[^"]+")/g;
  const sanitized = stripQuotedContent(content);
  const matches = sanitized.match(pattern) || [];

  return matches.map((m) => {
    // Remove @ prefix
    let mention = m.slice(1);
    // Remove quotes if present
    if (mention.startsWith('"') && mention.endsWith('"')) {
      mention = mention.slice(1, -1);
    }
    return mention.toLowerCase();
  });
}

/**
 * Check if content contains @all mention.
 */
export function hasAllMention(content: string): boolean {
  return /@all\b/i.test(stripQuotedContent(content));
}

/**
 * Strip quoted/cited content so mentions are only parsed from the new message body.
 * Removes fenced code blocks, inline code, and blockquoted lines.
 */
function stripQuotedContent(content: string): string {
  const withoutFences = content.replace(/```[\s\S]*?```/g, "");
  const withoutInlineCode = withoutFences.replace(/`[^`]*`/g, "");
  return withoutInlineCode
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n");
}

/**
 * Resolve mention strings to actual users and agents.
 *
 * @param ctx - Convex context
 * @param accountId - Account to search within
 * @param mentionStrings - Array of mention strings to resolve
 * @returns Array of resolved mentions
 */
export async function resolveMentions(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  mentionStrings: string[],
): Promise<ParsedMention[]> {
  if (mentionStrings.length === 0) {
    return [];
  }

  const mentions: ParsedMention[] = [];
  const resolved = new Set<string>();

  // Fetch all members and agents for the account
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  const agents = await ctx.db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const mentionStr of mentionStrings) {
    const normalized = mentionStr.toLowerCase();
    if (resolved.has(normalized)) continue;

    // Try to match user by name (case-insensitive)
    const matchedMember = memberships.find(
      (m) =>
        m.userName.toLowerCase() === normalized ||
        m.userEmail.toLowerCase().split("@")[0] === normalized,
    );

    if (matchedMember) {
      mentions.push({
        type: "user",
        id: matchedMember.userId,
        name: matchedMember.userName,
      });
      resolved.add(normalized);
      continue;
    }

    // Try to match agent by slug or name (case-insensitive)
    let matchedAgent = agents.find(
      (a) =>
        a.slug.toLowerCase() === normalized ||
        a.name.toLowerCase() === normalized,
    );

    // Fallback: @qa resolves to the account's QA agent by role (e.g. "QA / Reviewer")
    // when no agent has slug/name "qa", so @qa is always mentionable when a QA agent exists.
    if (!matchedAgent && normalized === "qa") {
      const qaAgents = agents.filter((a) => isQaAgentProfile(a));
      matchedAgent =
        qaAgents.find((a) => a.slug.toLowerCase() === "qa") ?? qaAgents[0];
    }

    if (matchedAgent) {
      // When @qa was resolved via role fallback, expose slug "qa" so UI mentionMap matches the token "@qa".
      const slugForMention =
        normalized === "qa" && matchedAgent.slug.toLowerCase() !== "qa"
          ? "qa"
          : matchedAgent.slug;
      mentions.push({
        type: "agent",
        id: matchedAgent._id,
        name: matchedAgent.name,
        slug: slugForMention,
      });
      resolved.add(normalized);
    }

    // If no match, skip (don't include unresolved mentions)
  }

  return mentions;
}

/**
 * Get all mentionable entities for @all.
 */
export async function getAllMentions(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  excludeAuthorId?: string,
): Promise<ParsedMention[]> {
  const mentions: ParsedMention[] = [];

  // Get all members
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const m of memberships) {
    if (m.userId !== excludeAuthorId) {
      mentions.push({
        type: "user",
        id: m.userId,
        name: m.userName,
      });
    }
  }

  // Get all agents
  const agents = await ctx.db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  for (const a of agents) {
    if (a._id !== excludeAuthorId) {
      mentions.push({
        type: "agent",
        id: a._id,
        name: a.name,
        slug: a.slug,
      });
    }
  }

  return mentions;
}

/**
 * List all mentionable candidates for @mention autocomplete.
 * Returns workspace members and agents, grouped by type for UI.
 *
 * @param ctx - Convex context
 * @param accountId - Account to search within
 * @returns Object with users and agents arrays
 */
export async function listCandidates(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
): Promise<{
  users: Array<{ id: string; name: string; email: string; avatarUrl?: string }>;
  agents: Array<{ id: string; name: string; slug: string }>;
}> {
  // Fetch all members
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  const users = memberships.map((m) => ({
    id: m.userId,
    name: m.userName,
    email: m.userEmail,
    avatarUrl: m.userAvatarUrl,
  }));

  // Fetch all agents
  const agents = await ctx.db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  const account = await ctx.db.get(accountId);
  const orchestratorAgentId = (
    account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined
  )?.orchestratorAgentId;

  const agentList = agents
    .map((a) => ({
      id: a._id,
      name: a.name,
      slug: a.slug,
    }))
    .sort((a, b) => {
      const aIsOrchestrator =
        orchestratorAgentId != null && a.id === orchestratorAgentId;
      const bIsOrchestrator =
        orchestratorAgentId != null && b.id === orchestratorAgentId;
      if (aIsOrchestrator && !bIsOrchestrator) return -1;
      if (!aIsOrchestrator && bIsOrchestrator) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  return {
    users,
    agents: agentList,
  };
}
