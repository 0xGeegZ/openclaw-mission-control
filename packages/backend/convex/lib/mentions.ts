import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import type { Doc } from "../_generated/dataModel";
import type { RecipientType } from "@packages/shared";
import {
  extractMentionCandidates,
  extractSimpleMentionStrings,
  findLongestMentionKey,
  stripQuotedContentForMentions,
} from "@packages/shared";

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
  return extractSimpleMentionStrings(content);
}

/**
 * Check if content contains @all mention.
 */
export function hasAllMention(content: string): boolean {
  return /@all\b/i.test(stripQuotedContentForMentions(content));
}

/**
 * Resolve mention strings to actual users and agents.
 *
 * @param ctx - Convex context
 * @param accountId - Account to search within
 * @param options - Optional content and/or mentionStrings to resolve
 * @returns Array of resolved mentions
 */
export interface ResolveMentionsOptions {
  /**
   * Full message content used for robust resolution (supports unquoted multi-word mentions).
   */
  content?: string;
  /**
   * Optional pre-parsed mention strings (legacy call path compatibility).
   */
  mentionStrings?: string[];
}

function normalizeResolveMentionsOptions(
  options?: ResolveMentionsOptions | string[],
): ResolveMentionsOptions {
  if (Array.isArray(options)) {
    return { mentionStrings: options };
  }
  return options ?? {};
}

/**
 * Resolve a candidate by exact lookup first, then by longest space-delimited prefix.
 */
function resolveMentionCandidate(
  candidate: string,
  params: {
    userByName: Map<string, Doc<"memberships">>;
    userByEmailPrefix: Map<string, Doc<"memberships">>;
    agentBySlug: Map<string, Doc<"agents">>;
    agentByName: Map<string, Doc<"agents">>;
    qaAgents: Doc<"agents">[];
    sortedUserKeys: string[];
    sortedAgentSlugKeys: string[];
    sortedAgentNameKeys: string[];
  },
): ParsedMention | null {
  const normalized = candidate.trim().toLowerCase();
  if (!normalized) return null;

  const exactMember =
    params.userByName.get(normalized) ??
    params.userByEmailPrefix.get(normalized);
  if (exactMember) {
    return {
      type: "user",
      id: exactMember.userId,
      name: exactMember.userName,
    };
  }

  let exactAgent =
    params.agentBySlug.get(normalized) ?? params.agentByName.get(normalized);

  if (!exactAgent && normalized === "qa") {
    exactAgent =
      params.qaAgents.find((a) => a.slug.toLowerCase() === "qa") ??
      params.qaAgents[0];
  }

  if (exactAgent) {
    const slugForMention =
      normalized === "qa" && exactAgent.slug.toLowerCase() !== "qa"
        ? "qa"
        : exactAgent.slug;
    return {
      type: "agent",
      id: exactAgent._id,
      name: exactAgent.name,
      slug: slugForMention,
    };
  }

  const userPrefix = findLongestMentionKey(normalized, params.sortedUserKeys);
  if (userPrefix) {
    const member = params.userByName.get(userPrefix);
    if (member) {
      return {
        type: "user",
        id: member.userId,
        name: member.userName,
      };
    }
  }

  const agentSlugPrefix = findLongestMentionKey(
    normalized,
    params.sortedAgentSlugKeys,
  );
  if (agentSlugPrefix) {
    const agent = params.agentBySlug.get(agentSlugPrefix);
    if (agent) {
      return {
        type: "agent",
        id: agent._id,
        name: agent.name,
        slug: agent.slug,
      };
    }
  }

  const agentNamePrefix = findLongestMentionKey(
    normalized,
    params.sortedAgentNameKeys,
  );
  if (agentNamePrefix) {
    const agent = params.agentByName.get(agentNamePrefix);
    if (agent) {
      return {
        type: "agent",
        id: agent._id,
        name: agent.name,
        slug: agent.slug,
      };
    }
  }

  return null;
}

export async function resolveMentions(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  options?: ResolveMentionsOptions | string[],
): Promise<ParsedMention[]> {
  const normalizedOptions = normalizeResolveMentionsOptions(options);
  // Fetch all members and agents for the account
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  const agents = await ctx.db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  const mentionCandidates = new Set(
    (normalizedOptions.mentionStrings ?? [])
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean),
  );
  if (normalizedOptions.content) {
    for (const candidate of extractMentionCandidates(
      normalizedOptions.content,
    )) {
      mentionCandidates.add(candidate);
    }
  }
  if (mentionCandidates.size === 0) return [];

  const userByName = new Map<string, Doc<"memberships">>();
  const userByEmailPrefix = new Map<string, Doc<"memberships">>();
  for (const membership of memberships) {
    userByName.set(membership.userName.toLowerCase(), membership);
    const emailPrefix = membership.userEmail.toLowerCase().split("@")[0];
    if (emailPrefix) userByEmailPrefix.set(emailPrefix, membership);
  }

  const agentBySlug = new Map<string, Doc<"agents">>();
  const agentByName = new Map<string, Doc<"agents">>();
  for (const agent of agents) {
    agentBySlug.set(agent.slug.toLowerCase(), agent);
    agentByName.set(agent.name.toLowerCase(), agent);
  }
  const qaAgents = agents.filter((a) => isQaAgentProfile(a));
  const sortedUserKeys = Array.from(userByName.keys()).sort(
    (a, b) => b.length - a.length,
  );
  const sortedAgentSlugKeys = Array.from(agentBySlug.keys()).sort(
    (a, b) => b.length - a.length,
  );
  const sortedAgentNameKeys = Array.from(agentByName.keys()).sort(
    (a, b) => b.length - a.length,
  );

  const mentions: ParsedMention[] = [];
  const seenRecipients = new Set<string>();
  for (const candidate of Array.from(mentionCandidates)) {
    const resolved = resolveMentionCandidate(candidate, {
      userByName,
      userByEmailPrefix,
      agentBySlug,
      agentByName,
      qaAgents,
      sortedUserKeys,
      sortedAgentSlugKeys,
      sortedAgentNameKeys,
    });
    if (!resolved) continue;

    const recipientKey = `${resolved.type}:${resolved.id}`;
    if (seenRecipients.has(recipientKey)) continue;
    seenRecipients.add(recipientKey);
    mentions.push(resolved);
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
