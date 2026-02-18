import { v } from "convex/values";
import {
  internalQuery,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

const TASK_PREFIX = "task:";
const SYSTEM_PREFIX = "system:";

/**
 * Builds the session key for a task-scoped (task, agent) generation.
 * Format: task:{taskId}:agent:{agentSlug}:{accountId}:v{generation}
 */
function buildTaskSessionKey(
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  agentSlug: string,
  generation: number,
): string {
  return `${TASK_PREFIX}${taskId}:agent:${agentSlug}:${accountId}:v${generation}`;
}

/**
 * Builds the session key for a system (non-task) session.
 * Format: system:agent:{agentSlug}:{accountId}:v{generation}
 */
function buildSystemSessionKey(
  accountId: Id<"accounts">,
  agentSlug: string,
  generation: number,
): string {
  return `${SYSTEM_PREFIX}agent:${agentSlug}:${accountId}:v${generation}`;
}

/**
 * Returns the active task session for (accountId, taskId, agentId), if any.
 */
export const getActiveTaskSession = internalQuery({
  args: {
    accountId: v.id("accounts"),
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
  },
  handler: async (
    ctx: QueryCtx,
    args,
  ): Promise<{ sessionKey: string; generation: number } | null> => {
    const row = await ctx.db
      .query("agentRuntimeSessions")
      .withIndex("by_account_type_task_agent_closed", (q) =>
        q
          .eq("accountId", args.accountId)
          .eq("sessionType", "task")
          .eq("taskId", args.taskId)
          .eq("agentId", args.agentId)
          .eq("closedAt", undefined),
      )
      .first();
    if (!row) return null;
    return { sessionKey: row.sessionKey, generation: row.generation };
  },
});

/**
 * Returns the active system session for (accountId, agentId), if any.
 */
export const getActiveSystemSession = internalQuery({
  args: {
    accountId: v.id("accounts"),
    agentId: v.id("agents"),
  },
  handler: async (
    ctx: QueryCtx,
    args,
  ): Promise<{ sessionKey: string; generation: number } | null> => {
    const row = await ctx.db
      .query("agentRuntimeSessions")
      .withIndex("by_account_type_agent_closed", (q) =>
        q
          .eq("accountId", args.accountId)
          .eq("sessionType", "system")
          .eq("agentId", args.agentId)
          .eq("closedAt", undefined),
      )
      .first();
    if (!row) return null;
    return { sessionKey: row.sessionKey, generation: row.generation };
  },
});

/**
 * Ensure one active system session for an agent and return the session key.
 * Reuses an open session when present; otherwise creates the next generation.
 */
async function ensureSystemSessionForAgent(params: {
  ctx: MutationCtx;
  accountId: Id<"accounts">;
  agentId: Id<"agents">;
  agentSlug: string;
}): Promise<string> {
  const { ctx, accountId, agentId, agentSlug } = params;
  const existing = await ctx.db
    .query("agentRuntimeSessions")
    .withIndex("by_account_type_agent_closed", (q) =>
      q
        .eq("accountId", accountId)
        .eq("sessionType", "system")
        .eq("agentId", agentId)
        .eq("closedAt", undefined),
    )
    .first();
  if (existing) return existing.sessionKey;

  const systemSessions = await ctx.db
    .query("agentRuntimeSessions")
    .withIndex("by_account_type_agent_closed", (q) =>
      q
        .eq("accountId", accountId)
        .eq("sessionType", "system")
        .eq("agentId", agentId),
    )
    .collect();
  const maxGen = systemSessions.length
    ? Math.max(...systemSessions.map((r) => r.generation))
    : 0;
  const generation = maxGen + 1;
  const sessionKey = buildSystemSessionKey(accountId, agentSlug, generation);
  await ctx.db.insert("agentRuntimeSessions", {
    accountId,
    agentId,
    sessionType: "system",
    agentSlug,
    generation,
    sessionKey,
    openedAt: Date.now(),
  });
  return sessionKey;
}

/**
 * Ensures a runtime session exists: task session when taskId provided, otherwise system session.
 * Reuses active session or creates new generation. Returns sessionKey and whether a new row was created.
 */
export const ensureRuntimeSession = internalMutation({
  args: {
    accountId: v.id("accounts"),
    agentId: v.id("agents"),
    agentSlug: v.string(),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (
    ctx: MutationCtx,
    args,
  ): Promise<{ sessionKey: string; isNew: boolean }> => {
    if (args.taskId != null) {
      const existing = await ctx.db
        .query("agentRuntimeSessions")
        .withIndex("by_account_type_task_agent_closed", (q) =>
          q
            .eq("accountId", args.accountId)
            .eq("sessionType", "task")
            .eq("taskId", args.taskId)
            .eq("agentId", args.agentId)
            .eq("closedAt", undefined),
        )
        .first();
      if (existing) return { sessionKey: existing.sessionKey, isNew: false };

      const allForTaskAgent = await ctx.db
        .query("agentRuntimeSessions")
        .withIndex("by_account_task", (q) =>
          q.eq("accountId", args.accountId).eq("taskId", args.taskId),
        )
        .collect();
      const forAgent = allForTaskAgent.filter(
        (r) => r.agentId === args.agentId,
      );
      const maxGen = forAgent.length
        ? Math.max(...forAgent.map((r) => r.generation))
        : 0;
      const generation = maxGen + 1;
      const sessionKey = buildTaskSessionKey(
        args.accountId,
        args.taskId,
        args.agentSlug,
        generation,
      );
      await ctx.db.insert("agentRuntimeSessions", {
        accountId: args.accountId,
        agentId: args.agentId,
        sessionType: "task",
        taskId: args.taskId,
        agentSlug: args.agentSlug,
        generation,
        sessionKey,
        openedAt: Date.now(),
      });
      return { sessionKey, isNew: true };
    }

    const before = await ctx.db
      .query("agentRuntimeSessions")
      .withIndex("by_account_type_agent_closed", (q) =>
        q
          .eq("accountId", args.accountId)
          .eq("sessionType", "system")
          .eq("agentId", args.agentId)
          .eq("closedAt", undefined),
      )
      .first();
    const sessionKey = await ensureSystemSessionForAgent({
      ctx,
      accountId: args.accountId,
      agentId: args.agentId,
      agentSlug: args.agentSlug,
    });
    return { sessionKey, isNew: !before };
  },
});

/**
 * Ensures one active system session per agent for the account.
 * Retained as a batch helper for maintenance flows.
 * Reuses existing open system session or creates a new generation; returns one entry per agent.
 *
 * @returns Array of { agentId, sessionKey } in same order as account agents.
 */
export const ensureSystemSessionsForAccount = internalMutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (
    ctx: MutationCtx,
    args,
  ): Promise<Array<{ agentId: Id<"agents">; sessionKey: string }>> => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    const result: Array<{ agentId: Id<"agents">; sessionKey: string }> = [];
    for (const agent of agents) {
      const sessionKey = await ensureSystemSessionForAgent({
        ctx,
        accountId: args.accountId,
        agentId: agent._id,
        agentSlug: agent.slug,
      });
      result.push({ agentId: agent._id, sessionKey });
    }
    return result;
  },
});

/**
 * Atomically list account agents and ensure each has a system session key.
 * Returns the same agent set used for session ensure, avoiding cross-call race windows.
 */
export const listAgentsWithSystemSessions = internalMutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (
    ctx: MutationCtx,
    args,
  ): Promise<Array<{ agent: Doc<"agents">; systemSessionKey: string }>> => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    const result: Array<{ agent: Doc<"agents">; systemSessionKey: string }> =
      [];
    for (const agent of agents) {
      const systemSessionKey = await ensureSystemSessionForAgent({
        ctx,
        accountId: args.accountId,
        agentId: agent._id,
        agentSlug: agent.slug,
      });
      result.push({ agent, systemSessionKey });
    }
    return result;
  },
});

/**
 * Closes all active task-scoped sessions for the given task (e.g. when status → archived).
 */
export const closeTaskSessionsForTask = internalMutation({
  args: {
    accountId: v.id("accounts"),
    taskId: v.id("tasks"),
    closedReason: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args): Promise<{ closed: number }> => {
    const reason = args.closedReason ?? "task_archived";
    const now = Date.now();
    const active = await ctx.db
      .query("agentRuntimeSessions")
      .withIndex("by_account_task", (q) =>
        q.eq("accountId", args.accountId).eq("taskId", args.taskId),
      )
      .filter((q) => q.eq(q.field("closedAt"), undefined))
      .collect();
    for (const row of active) {
      await ctx.db.patch(row._id, { closedAt: now, closedReason: reason });
    }
    return { closed: active.length };
  },
});
