import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Doc } from "./_generated/dataModel";

/**
 * Internal: store a standup summary for an account/date.
 */
export const storeSummary = internalMutation({
  args: {
    accountId: v.id("accounts"),
    date: v.string(),
    summary: v.object({
      completedToday: v.number(),
      inProgress: v.number(),
      blocked: v.number(),
      needsReview: v.number(),
      taskIdsCompletedToday: v.array(v.id("tasks")),
      taskIdsInProgress: v.array(v.id("tasks")),
      taskIdsBlocked: v.array(v.id("tasks")),
      taskIdsNeedsReview: v.array(v.id("tasks")),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("standupSummaries", {
      accountId: args.accountId,
      date: args.date,
      summary: args.summary,
      createdAt: Date.now(),
    });
  },
});

/**
 * Get the latest standup summary for an account.
 */
export const getLatest = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const summary = await ctx.db
      .query("standupSummaries")
      .withIndex("by_account_date", (index) =>
        index.eq("accountId", args.accountId)
      )
      .order("desc")
      .first();
    return summary;
  },
});

/**
 * Get standup summary for a specific date.
 */
export const getByDate = query({
  args: {
    accountId: v.id("accounts"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("standupSummaries")
      .withIndex("by_account_date", (index) =>
        index.eq("accountId", args.accountId).eq("date", args.date)
      )
      .unique();
  },
});

/**
 * Compute and store daily standup summary for an account.
 * Can be called by a cron or on-demand from the UI.
 */
export const runDailyStandup = action({
  args: {
    accountId: v.id("accounts"),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dateStr =
      args.date ?? new Date().toISOString().slice(0, 10);
    const startOfDay = new Date(dateStr);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const startTs = startOfDay.getTime();
    const endTs = endOfDay.getTime();

    const tasks = await ctx.runQuery(internal.tasks.listForStandup, {
      accountId: args.accountId,
    });

    const taskIdsCompletedToday: Id<"tasks">[] = [];
    const taskIdsInProgress: Id<"tasks">[] = [];
    const taskIdsBlocked: Id<"tasks">[] = [];
    const taskIdsNeedsReview: Id<"tasks">[] = [];

    for (const t of tasks) {
      const task = t as Doc<"tasks">;
      if (task.status === "done") {
        const updatedAt = task.updatedAt ?? task.createdAt;
        if (updatedAt >= startTs && updatedAt <= endTs) {
          taskIdsCompletedToday.push(task._id);
        }
      } else if (task.status === "in_progress" || task.status === "assigned") {
        taskIdsInProgress.push(task._id);
      } else if (task.status === "blocked") {
        taskIdsBlocked.push(task._id);
      } else if (task.status === "review") {
        taskIdsNeedsReview.push(task._id);
      }
    }

    const summary = {
      completedToday: taskIdsCompletedToday.length,
      inProgress: taskIdsInProgress.length,
      blocked: taskIdsBlocked.length,
      needsReview: taskIdsNeedsReview.length,
      taskIdsCompletedToday,
      taskIdsInProgress,
      taskIdsBlocked,
      taskIdsNeedsReview,
    };

    await ctx.runMutation(internal.standup.storeSummary, {
      accountId: args.accountId,
      date: dateStr,
      summary,
    });

    return { date: dateStr, summary };
  },
});
