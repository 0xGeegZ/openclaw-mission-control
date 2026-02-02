import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import type { TaskStatus } from "./lib/task_workflow";

/**
 * Summary stats for the analytics dashboard.
 */
export type AnalyticsSummary = {
  taskCountByStatus: Record<TaskStatus, number>;
  agentCountByStatus: Record<string, number>;
  totalTasks: number;
  totalAgents: number;
  recentActivityCount: number;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Get analytics summary for an account: task counts by status, agent counts by status,
 * and recent activity count (last 24h). Used by the analytics dashboard.
 */
export const getSummary = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<AnalyticsSummary> => {
    await requireAccountMember(ctx, args.accountId);

    const [tasks, agents, activities] = await Promise.all([
      ctx.db
        .query("tasks")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .collect(),
      ctx.db
        .query("agents")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .collect(),
      ctx.db
        .query("activities")
        .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
        .collect(),
    ]);

    const taskCountByStatus: Record<string, number> = {
      inbox: 0,
      assigned: 0,
      in_progress: 0,
      review: 0,
      done: 0,
      blocked: 0,
    };
    for (const t of tasks) {
      taskCountByStatus[t.status] = (taskCountByStatus[t.status] ?? 0) + 1;
    }

    const agentCountByStatus: Record<string, number> = {};
    for (const a of agents) {
      agentCountByStatus[a.status] = (agentCountByStatus[a.status] ?? 0) + 1;
    }

    const since = Date.now() - ONE_DAY_MS;
    const recentActivityCount = activities.filter((a) => a.createdAt >= since).length;

    return {
      taskCountByStatus: taskCountByStatus as AnalyticsSummary["taskCountByStatus"],
      agentCountByStatus,
      totalTasks: tasks.length,
      totalAgents: agents.length,
      recentActivityCount,
    };
  },
});
