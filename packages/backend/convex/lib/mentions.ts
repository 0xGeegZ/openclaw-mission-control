import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Parsed mention with resolved entity.
 * slug is set for agents so the UI can match @slug in content (e.g. @squad-lead).
 */
export interface ParsedMention {
  type: "user" | "agent";
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
    // Skip if already resolved
    if (resolved.has(mentionStr)) continue;

    // Try to match user by name (case-insensitive)
    const matchedMember = memberships.find(
      (m) =>
        m.userName.toLowerCase() === mentionStr ||
        m.userEmail.toLowerCase().split("@")[0] === mentionStr,
    );

    if (matchedMember) {
      mentions.push({
        type: "user",
        id: matchedMember.userId,
        name: matchedMember.userName,
      });
      resolved.add(mentionStr);
      continue;
    }

    // Try to match agent by slug or name
    const matchedAgent = agents.find(
      (a) =>
        a.slug.toLowerCase() === mentionStr ||
        a.name.toLowerCase() === mentionStr,
    );

    if (matchedAgent) {
      mentions.push({
        type: "agent",
        id: matchedAgent._id,
        name: matchedAgent.name,
        slug: matchedAgent.slug,
      });
      resolved.add(mentionStr);
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
