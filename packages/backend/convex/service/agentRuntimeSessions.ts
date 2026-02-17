import { v } from "convex/values";
import {
  internalQuery,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { Id } from "../_generated/dataModel";

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

    const existing = await ctx.db
      .query("agentRuntimeSessions")
      .withIndex("by_account_type_agent_closed", (q) =>
        q
          .eq("accountId", args.accountId)
          .eq("sessionType", "system")
          .eq("agentId", args.agentId)
          .eq("closedAt", undefined),
      )
      .first();
    if (existing) return { sessionKey: existing.sessionKey, isNew: false };

    const systemSessions = await ctx.db
      .query("agentRuntimeSessions")
      .withIndex("by_account_type_agent_closed", (q) =>
        q
          .eq("accountId", args.accountId)
          .eq("sessionType", "system")
          .eq("agentId", args.agentId),
      )
      .collect();
    const maxGen = systemSessions.length
      ? Math.max(...systemSessions.map((r) => r.generation))
      : 0;
    const generation = maxGen + 1;
    const sessionKey = buildSystemSessionKey(
      args.accountId,
      args.agentSlug,
      generation,
    );
    await ctx.db.insert("agentRuntimeSessions", {
      accountId: args.accountId,
      agentId: args.agentId,
      sessionType: "system",
      agentSlug: args.agentSlug,
      generation,
      sessionKey,
      openedAt: Date.now(),
    });
    return { sessionKey, isNew: true };
  },
});

/**
 * Closes all active task-scoped sessions for the given task (e.g. when status → done).
 */
export const closeTaskSessionsForTask = internalMutation({
  args: {
    accountId: v.id("accounts"),
    taskId: v.id("tasks"),
    closedReason: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args): Promise<{ closed: number }> => {
    const reason = args.closedReason ?? "task_done";
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
