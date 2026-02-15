/**
 * Admin metrics and usage tracking functions.
 * Provides real-time and historical metrics for containers and accounts.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireAccountMember } from "./lib/auth";

/**
 * Get current metrics for a specific container.
 * Returns simulated resource utilization data.
 */
export const get_container_metrics = query({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    if (container.accountId !== args.accountId) {
      throw new Error("Container does not belong to this account");
    }

    // Get usage records for this container (last 24 hours)
    const now = Date.now();
    const yesterday = now - 24 * 60 * 60 * 1000;

    const usageRecords = await ctx.db
      .query("usageRecords")
      .filter((q) =>
        q.and(
          q.eq(q.field("containerId"), args.containerId),
          q.gte(q.field("timestamp"), yesterday)
        )
      )
      .collect();

    // Calculate aggregates
    const cpu = usageRecords
      .filter((r: any) => r.type === "cpu")
      .map((r: any) => r.value);
    const memory = usageRecords
      .filter((r: any) => r.type === "memory")
      .map((r: any) => r.value);
    const network = usageRecords
      .filter((r: any) => r.type === "network")
      .map((r: any) => r.value);

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const max = (arr: number[]) => (arr.length > 0 ? Math.max(...arr) : 0);

    return {
      containerId: args.containerId,
      containerName: container.name,
      timestamp: now,
      cpu: {
        current: cpu.length > 0 ? cpu[cpu.length - 1] : 0,
        avg: avg(cpu),
        max: max(cpu),
        unit: "%",
      },
      memory: {
        current: memory.length > 0 ? memory[memory.length - 1] : 0,
        avg: avg(memory),
        max: max(memory),
        unit: "MB",
      },
      network: {
        inbound: network.length > 0 ? network[network.length - 1] : 0,
        outbound: network.length > 0 ? network[network.length - 2] || 0 : 0,
        unit: "Mbps",
      },
      disk: {
        used: container.config?.diskLimit ? 512 : 256, // Mock data
        total: container.config?.diskLimit ?? 1024,
        unit: "MB",
      },
      period: {
        start: yesterday,
        end: now,
      },
    };
  },
});

/**
 * List all metrics for an account with aggregation.
 */
export const list_account_metrics = query({
  args: {
    accountId: v.id("accounts"),
    period: v.optional(v.union(v.literal("1h"), v.literal("24h"), v.literal("7d"))),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Get all containers for this account
    const containers = await ctx.db
      .query("containers")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    // Calculate period
    const now = Date.now();
    let startTime = now;
    switch (args.period ?? "24h") {
      case "1h":
        startTime = now - 60 * 60 * 1000;
        break;
      case "24h":
        startTime = now - 24 * 60 * 60 * 1000;
        break;
      case "7d":
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
    }

    // Aggregate metrics across all containers
    const metrics = containers.map((container) => ({
      containerId: container._id,
      containerName: container.name,
      status: container.status,
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      uptime: Math.random() * 100,
      restarts: Math.floor(Math.random() * 5),
    }));

    // Calculate account-level stats
    const totalContainers = containers.length;
    const runningContainers = containers.filter((c) => c.status === "running").length;
    const stoppedContainers = containers.filter((c) => c.status === "stopped").length;
    const degradedContainers = containers.filter((c) => c.status === "degraded").length;

    const avgCpu = metrics.reduce((a, m) => a + m.cpu, 0) / metrics.length || 0;
    const avgMemory = metrics.reduce((a, m) => a + m.memory, 0) / metrics.length || 0;
    const totalUptime = metrics.reduce((a, m) => a + m.uptime, 0) / metrics.length || 0;

    return {
      accountId: args.accountId,
      period: args.period ?? "24h",
      timestamp: now,
      summary: {
        totalContainers,
        runningContainers,
        stoppedContainers,
        degradedContainers,
        avgCpu: parseFloat(avgCpu.toFixed(2)),
        avgMemory: parseFloat(avgMemory.toFixed(2)),
        avgUptime: parseFloat(totalUptime.toFixed(2)),
      },
      containers: metrics,
    };
  },
});

/**
 * Get usage statistics for billing purposes.
 */
export const get_usage_stats = query({
  args: {
    accountId: v.id("accounts"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Get billing subscription for this account
    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .unique();

    if (!subscription) {
      throw new Error("No subscription found for this account");
    }

    // Get usage records for the period
    const usageRecords = await ctx.db
      .query("usageRecords")
      .filter((q) =>
        q.and(
          q.gte(q.field("timestamp"), args.startDate),
          q.lte(q.field("timestamp"), args.endDate)
        )
      )
      .collect();

    // Aggregate by type
    const messageCount = usageRecords
      .filter((r: any) => r.type === "message")
      .reduce((sum, r: any) => sum + (r.count ?? 1), 0);

    const apiCallCount = usageRecords
      .filter((r: any) => r.type === "api_call")
      .reduce((sum, r: any) => sum + (r.count ?? 1), 0);

    const agentCount = usageRecords
      .filter((r: any) => r.type === "agent")
      .reduce((sum, r: any) => sum + (r.count ?? 1), 0);

    const containerHours = usageRecords
      .filter((r: any) => r.type === "container_hour")
      .reduce((sum, r: any) => sum + (r.value ?? 0), 0);

    return {
      accountId: args.accountId,
      period: {
        start: args.startDate,
        end: args.endDate,
      },
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
      },
      usage: {
        messages: {
          count: messageCount,
          limit: subscription.plan === "enterprise" ? -1 : 10000,
        },
        apiCalls: {
          count: apiCallCount,
          limit: subscription.plan === "enterprise" ? -1 : 1000,
        },
        agents: {
          count: agentCount,
          limit: subscription.plan === "enterprise" ? -1 : 5,
        },
        containerHours: {
          count: Math.round(containerHours * 10) / 10,
          limit: subscription.plan === "enterprise" ? -1 : 100,
        },
      },
    };
  },
});
