import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import type { Id, Doc } from "./_generated/dataModel";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;
const DEFAULT_TASK_SEARCH_LIMIT = 20;
const MAX_TASK_SEARCH_LIMIT = 100;

/**
 * Normalize search query: trim and lowercase for case-insensitive matching.
 */
function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

/**
 * Check if text contains the search query (case-insensitive).
 */
function matches(text: string | undefined, query: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(query);
}

/**
 * Global search across tasks, documents, and agents for an account.
 * Uses indexed queries by accountId, then filters in memory by search string.
 * Results are bounded per category to avoid slow responses.
 */
export const globalSearch = query({
  args: {
    accountId: v.id("accounts"),
    searchQuery: v.string(),
    limitPerCategory: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const q = normalizeQuery(args.searchQuery);
    const limit = Math.min(
      args.limitPerCategory ?? DEFAULT_LIMIT,
      MAX_LIMIT
    );

    if (!q) {
      return { tasks: [], documents: [], agents: [] };
    }

    const [tasks, documents, agents] = await Promise.all([
      ctx.db
        .query("tasks")
        .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
        .collect(),
      ctx.db
        .query("documents")
        .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
        .collect(),
      ctx.db
        .query("agents")
        .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
        .collect(),
    ]);

    const filteredTasks = tasks
      .filter(
        (t) =>
          matches(t.title, q) || matches(t.description ?? undefined, q)
      )
      .slice(0, limit)
      .map((t) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        kind: "task" as const,
      }));

    const filteredDocs = documents
      .filter(
        (d) =>
          matches(d.title, q) ||
          matches(d.name ?? undefined, q) ||
          matches(d.content ?? undefined, q)
      )
      .slice(0, limit)
      .map((d) => ({
        id: d._id,
        title: d.title ?? d.name ?? "Untitled",
        kind: "document" as const,
      }));

    const filteredAgents = agents
      .filter((a) => matches(a.name, q) || matches(a.role ?? undefined, q))
      .slice(0, limit)
      .map((a) => ({
        id: a._id,
        title: a.name,
        role: a.role ?? undefined,
        kind: "agent" as const,
      }));

    return {
      tasks: filteredTasks,
      documents: filteredDocs,
      agents: filteredAgents,
    };
  },
});

/**
 * Internal: search tasks by title, description, or blockers for runtime service.
 * Returns tasks with relevance score (higher = better match).
 * Field weights: title (3x) > description (2x) > blocker text (1x)
 */
export const searchTasksInternal = internalQuery({
  args: {
    accountId: v.id("accounts"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const q = normalizeQuery(args.query);
    const limit = Math.min(
      args.limit ?? DEFAULT_TASK_SEARCH_LIMIT,
      MAX_TASK_SEARCH_LIMIT
    );

    if (!q) {
      return [];
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .collect();

    /**
     * Calculate relevance score for a task based on field matches.
     * Title matches are weighted higher, then description, then blockers.
     */
    function scoreTask(task: Doc<"tasks">): number {
      let score = 0;
      const titleMatches = (task.title.match(new RegExp(q, "gi")) ?? []).length;
      const descMatches = (
        (task.description ?? "").match(new RegExp(q, "gi")) ?? []
      ).length;
      const blockerMatches = (
        (task.blockedReason ?? "").match(new RegExp(q, "gi")) ?? []
      ).length;

      // Weight matches: title (3x) > description (2x) > blocker (1x)
      score += titleMatches * 3;
      score += descMatches * 2;
      score += blockerMatches * 1;

      return score;
    }

    // Score and filter all tasks
    const scored = tasks
      .map((task) => ({
        task,
        score: scoreTask(task),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => ({
        _id: item.task._id,
        title: item.task.title,
        status: item.task.status,
        priority: item.task.priority,
        blockedReason: item.task.blockedReason,
        assignedAgentIds: item.task.assignedAgentIds,
        assignedUserIds: item.task.assignedUserIds,
        createdAt: item.task.createdAt,
        updatedAt: item.task.updatedAt,
        relevanceScore: item.score,
      }));

    return scored;
  },
});
