import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Analytics metrics computation.
 * Queries tasks table to compute team activity metrics for a given time range.
 */

/**
 * Time range type.
 * "day" = last 24 hours
 * "week" = last 7 days
 * "month" = last 30 days
 * "custom" = requires fromDate and toDate in ms
 */
type TimeRange = "day" | "week" | "month" | "custom";

interface AgentStats {
  agentId: string;
  agentName: string;
  taskCount: number;
  completedCount: number;
  avgResponseTime: number; // in hours
}

interface MemberActivity {
  memberId: string;
  memberName: string;
  messageCount: number;
  tasksAssigned: number;
  lastActivityAt: number;
}

interface TimeSeriesPoint {
  date: string;
  completed: number;
}

interface AnalyticsMetrics {
  /** Total tasks created in the time range */
  totalTasks: number;

  /** Tasks with status "done" in the time range */
  completedTasks: number;

  /** Tasks with status "in_progress" at the time range boundary */
  inProgressCount: number;

  /** Average time from creation to completion (in hours) */
  avgCompletionTime: number;

  /** Time range used for calculation */
  timeRange: TimeRange;

  /** Start timestamp (ms) */
  fromDate: number;

  /** End timestamp (ms) */
  toDate: number;

  /** Time-series data for task completion trend */
  completionTrend: TimeSeriesPoint[];
}

/**
 * Get analytics metrics for a given time range.
 *
 * @param timeRange - "day", "week", "month", or "custom"
 * @param fromDate - Start date (ms), required if timeRange is "custom"
 * @param toDate - End date (ms), defaults to now
 */
export const getMetrics = query({
  args: {
    timeRange: v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("custom"),
    ),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
  },
  async handler(ctx, args) {
    // Get the current user's account
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Find the user's account membership
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    if (!membership) {
      throw new Error("User not found in any account");
    }

    const accountId = membership.accountId;

    // Calculate time boundaries
    const now = args.toDate || Date.now();
    let fromDate: number;

    switch (args.timeRange) {
      case "day":
        fromDate = now - 24 * 60 * 60 * 1000;
        break;
      case "week":
        fromDate = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "month":
        fromDate = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "custom":
        if (!args.fromDate) {
          throw new Error("fromDate is required for custom time range");
        }
        fromDate = args.fromDate;
        break;
    }

    // Fetch all tasks for the account
    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_account_created", (q) => q.eq("accountId", accountId))
      .collect();

    // Filter tasks by time range
    const tasksInRange = allTasks.filter(
      (task) => task.createdAt >= fromDate && task.createdAt <= now,
    );

    // Calculate metrics
    const totalTasks = tasksInRange.length;

    // Completed tasks: those with status "done" AND have been marked done within time range
    const completedTasks = tasksInRange.filter(
      (task) => task.status === "done",
    ).length;

    // In-progress tasks: current status is "in_progress"
    // Note: We're using current status, not filtered by time range
    // This shows how many tasks are currently in progress
    const inProgressCount = allTasks.filter(
      (task) => task.status === "in_progress",
    ).length;

    // Average completion time: for tasks that are done, calculate time from created to done
    // Since we don't have a "completedAt" field, we use updatedAt as proxy for done time
    const completedTasksWithTiming = tasksInRange
      .filter((task) => task.status === "done")
      .map((task) => {
        // updatedAt is the last time the task was updated (including status change to done)
        const completionTime = task.updatedAt - task.createdAt;
        return completionTime / (60 * 60 * 1000); // Convert to hours
      });

    const avgCompletionTime =
      completedTasksWithTiming.length > 0
        ? completedTasksWithTiming.reduce((a, b) => a + b, 0) /
          completedTasksWithTiming.length
        : 0;

    // Build time-series data for completion trend
    const completionTrendMap = new Map<string, number>();
    const timeSeriesPoints: TimeSeriesPoint[] = [];

    // Initialize date range
    let currentDate = new Date(fromDate);
    const endDate = new Date(now);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      completionTrendMap.set(dateStr, 0);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Count completed tasks per date
    tasksInRange
      .filter((task) => task.status === "done")
      .forEach((task) => {
        const completedDate = new Date(task.updatedAt)
          .toISOString()
          .split("T")[0];
        completionTrendMap.set(
          completedDate,
          (completionTrendMap.get(completedDate) || 0) + 1,
        );
      });

    // Convert map to sorted time series points
    Array.from(completionTrendMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .forEach(([date, completed]) => {
        timeSeriesPoints.push({ date, completed });
      });

    return {
      totalTasks,
      completedTasks,
      inProgressCount,
      avgCompletionTime: Math.round(avgCompletionTime * 100) / 100, // Round to 2 decimals
      timeRange: args.timeRange,
      fromDate,
      toDate: now,
      completionTrend: timeSeriesPoints,
    } as AnalyticsMetrics;
  },
});

/**
 * Get agent statistics for a given time range.
 * Computes tasks assigned to each agent and completion metrics.
 */
export const getAgentStats = query({
  args: {
    timeRange: v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("custom"),
    ),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    if (!membership) {
      throw new Error("User not found in any account");
    }

    const accountId = membership.accountId;

    // Calculate time boundaries
    const now = args.toDate || Date.now();
    let fromDate: number;

    switch (args.timeRange) {
      case "day":
        fromDate = now - 24 * 60 * 60 * 1000;
        break;
      case "week":
        fromDate = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "month":
        fromDate = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "custom":
        if (!args.fromDate) {
          throw new Error("fromDate is required for custom time range");
        }
        fromDate = args.fromDate;
        break;
    }

    // Fetch all tasks for the account
    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_account_created", (q) => q.eq("accountId", accountId))
      .collect();

    // Fetch all agents for the account
    const allAgents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();

    // Filter tasks by time range and compute agent stats
    const tasksInRange = allTasks.filter(
      (task) => task.createdAt >= fromDate && task.createdAt <= now,
    );

    // Group tasks by assigned agents
    const agentTaskMap = new Map<string, typeof tasksInRange>();
    tasksInRange.forEach((task) => {
      task.assignedAgentIds.forEach((agentId) => {
        if (!agentTaskMap.has(agentId)) {
          agentTaskMap.set(agentId, []);
        }
        agentTaskMap.get(agentId)!.push(task);
      });
    });

    // Build agent stats
    const agentStats: AgentStats[] = allAgents
      .map((agent) => {
        const tasks = agentTaskMap.get(agent._id) || [];
        const completedTasks = tasks.filter((t) => t.status === "done");

        // Calculate average response time (proxy: time from creation to done status)
        const responseTimes = completedTasks.map((task) => {
          return (task.updatedAt - task.createdAt) / (60 * 60 * 1000); // Convert to hours
        });

        const avgResponseTime =
          responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : 0;

        return {
          agentId: agent._id,
          agentName: agent.name,
          taskCount: tasks.length,
          completedCount: completedTasks.length,
          avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        };
      })
      .filter((stat) => stat.taskCount > 0) // Only return agents with tasks
      .sort((a, b) => b.taskCount - a.taskCount); // Sort by task count descending

    return agentStats;
  },
});

/**
 * Get member activity for a given time range.
 * Computes messages sent and tasks assigned per user.
 */
export const getMemberActivity = query({
  args: {
    timeRange: v.union(
      v.literal("day"),
      v.literal("week"),
      v.literal("month"),
      v.literal("custom"),
    ),
    fromDate: v.optional(v.number()),
    toDate: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    if (!membership) {
      throw new Error("User not found in any account");
    }

    const accountId = membership.accountId;

    // Calculate time boundaries
    const now = args.toDate || Date.now();
    let fromDate: number;

    switch (args.timeRange) {
      case "day":
        fromDate = now - 24 * 60 * 60 * 1000;
        break;
      case "week":
        fromDate = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "month":
        fromDate = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "custom":
        if (!args.fromDate) {
          throw new Error("fromDate is required for custom time range");
        }
        fromDate = args.fromDate;
        break;
    }

    // Fetch all messages, tasks, and memberships for the account
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_account_created", (q) => q.eq("accountId", accountId))
      .collect();

    const allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_account_created", (q) => q.eq("accountId", accountId))
      .collect();

    const allMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();

    // Filter by time range
    const messagesInRange = allMessages.filter(
      (msg) =>
        msg.createdAt >= fromDate &&
        msg.createdAt <= now &&
        msg.authorType === "user",
    );

    const tasksInRange = allTasks.filter(
      (task) => task.createdAt >= fromDate && task.createdAt <= now,
    );

    // Group messages by author
    const messageMap = new Map<string, number>();
    messagesInRange.forEach((msg) => {
      messageMap.set(msg.authorId, (messageMap.get(msg.authorId) || 0) + 1);
    });

    // Group tasks by assigned users
    const taskAssignmentMap = new Map<string, number>();
    tasksInRange.forEach((task) => {
      task.assignedUserIds.forEach((userId) => {
        taskAssignmentMap.set(
          userId,
          (taskAssignmentMap.get(userId) || 0) + 1,
        );
      });
    });

    // Build member activity stats
    const memberActivity: MemberActivity[] = allMemberships
      .map((membership) => ({
        memberId: membership.userId,
        memberName: membership.userName,
        messageCount: messageMap.get(membership.userId) || 0,
        tasksAssigned: taskAssignmentMap.get(membership.userId) || 0,
        lastActivityAt: now, // Placeholder; would need to track per member
      }))
      .filter((stat) => stat.messageCount > 0 || stat.tasksAssigned > 0) // Only return active members
      .sort((a, b) => b.messageCount + b.tasksAssigned - (a.messageCount + a.tasksAssigned)); // Sort by total activity

    return memberActivity;
  },
});
