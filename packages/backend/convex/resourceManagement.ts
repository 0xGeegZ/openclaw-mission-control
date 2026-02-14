/**
 * Resource Management & Monitoring API
 * Handles real-time resource monitoring, quota enforcement, and alerts.
 */
import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireAccountMember, requireAccountAdmin } from "./lib/auth";
import {
  getResourceQuota,
  checkResourceQuota,
  incrementResourceUsage,
  decrementResourceUsage,
  getContainerMetrics,
  recordResourceMetrics,
  getContainerMetricsHistory,
  getAccountResourceMetrics,
} from "./lib/resourceHelpers";

/**
 * Get resource quota for an account
 */
export const getAccountQuota = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    return await getResourceQuota(ctx, args.accountId);
  },
});

/**
 * Check if a container with given resources can be created
 */
export const checkQuotaForContainer = query({
  args: {
    accountId: v.id("accounts"),
    cpuLimit: v.optional(v.number()),
    memoryLimit: v.optional(v.number()),
    diskLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const cpuLimit = args.cpuLimit ?? 500; // Default to 500m
    const memoryLimit = args.memoryLimit ?? 512; // Default to 512MB
    const diskLimit = args.diskLimit ?? 5120; // Default to 5GB

    const result = await checkResourceQuota(
      ctx,
      args.accountId,
      cpuLimit,
      memoryLimit,
      diskLimit,
    );

    return {
      allowed: result.allowed,
      message: result.message,
      requestedResources: {
        cpu: cpuLimit,
        memory: memoryLimit,
        disk: diskLimit,
      },
    };
  },
});

/**
 * Get current resource metrics for a container
 */
export const getContainerResourceMetrics = query({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Verify container ownership
    const container = await ctx.db.get(args.containerId);
    if (!container || container.accountId !== args.accountId) {
      throw new Error("Container not found or does not belong to this account");
    }

    const metrics = await getContainerMetrics(ctx, args.containerId);

    if (!metrics) {
      return {
        containerId: args.containerId,
        message: "No metrics available yet",
        status: "no_data",
      };
    }

    return {
      containerId: args.containerId,
      containerName: container.name,
      cpuUsageMilicores: metrics.cpuUsageMilicores,
      cpuUsagePercent: metrics.cpuUsagePercent,
      cpuLimit: container.config.cpuLimit,
      memoryUsageBytes: metrics.memoryUsageBytes,
      memoryUsagePercent: metrics.memoryUsagePercent,
      memoryLimit: container.config.memoryLimit,
      diskUsageBytes: metrics.diskUsageBytes,
      diskUsagePercent: metrics.diskUsagePercent,
      diskLimit: container.config.diskLimit,
      alerts: {
        cpu: metrics.cpuThresholdExceeded,
        memory: metrics.memoryThresholdExceeded,
        disk: metrics.diskThresholdExceeded,
      },
      recordedAt: metrics.recordedAt,
    };
  },
});

/**
 * Get resource metrics history for a container
 */
export const getContainerMetricsHistoryQuery = query({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    // Verify container ownership
    const container = await ctx.db.get(args.containerId);
    if (!container || container.accountId !== args.accountId) {
      throw new Error("Container not found or does not belong to this account");
    }

    const history = await getContainerMetricsHistory(
      ctx,
      args.accountId,
      args.containerId,
      args.limit ?? 24,
    );

    return {
      containerId: args.containerId,
      containerName: container.name,
      metricsCount: history.length,
      metrics: history.map((m) => ({
        cpuUsageMilicores: m.cpuUsageMilicores,
        cpuUsagePercent: m.cpuUsagePercent,
        memoryUsageBytes: m.memoryUsageBytes,
        memoryUsagePercent: m.memoryUsagePercent,
        diskUsageBytes: m.diskUsageBytes,
        diskUsagePercent: m.diskUsagePercent,
        alerts: {
          cpu: m.cpuThresholdExceeded,
          memory: m.memoryThresholdExceeded,
          disk: m.diskThresholdExceeded,
        },
        recordedAt: m.recordedAt,
      })),
    };
  },
});

/**
 * Get aggregate resource metrics for all containers in an account
 */
export const getAccountMetrics = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const metrics = await getAccountResourceMetrics(ctx, args.accountId);
    const quota = await getResourceQuota(ctx, args.accountId);

    const cpuUsagePercent =
      quota.maxTotalCpu > 0
        ? (metrics.totalCpuUsage / quota.maxTotalCpu) * 100
        : 0;
    const memoryUsagePercent =
      quota.maxTotalMemory > 0
        ? (metrics.totalMemoryUsage / (quota.maxTotalMemory * 1024 * 1024)) * 100
        : 0;
    const diskUsagePercent =
      quota.maxTotalDisk > 0
        ? (metrics.totalDiskUsage / (quota.maxTotalDisk * 1024 * 1024)) * 100
        : 0;

    return {
      accountId: args.accountId,
      quota: {
        maxTotalCpu: quota.maxTotalCpu,
        maxTotalMemory: quota.maxTotalMemory,
        maxTotalDisk: quota.maxTotalDisk,
      },
      usage: {
        totalCpuInUse: metrics.totalCpuUsage,
        totalCpuPercent: Math.min(100, cpuUsagePercent),
        totalMemoryInUse: metrics.totalMemoryUsage,
        totalMemoryPercent: Math.min(100, memoryUsagePercent),
        totalDiskInUse: metrics.totalDiskUsage,
        totalDiskPercent: Math.min(100, diskUsagePercent),
      },
      containerCount: metrics.containerMetrics.length,
      alerts: {
        highCpuUsage: metrics.containerMetrics.some(
          (m) => m?.cpuThresholdExceeded,
        ),
        highMemoryUsage: metrics.containerMetrics.some(
          (m) => m?.memoryThresholdExceeded,
        ),
        highDiskUsage: metrics.containerMetrics.some(
          (m) => m?.diskThresholdExceeded,
        ),
      },
    };
  },
});

/**
 * Internal: Record resource metrics for a container
 * Called by monitoring daemon/service
 */
export const recordMetricsInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
    cpuUsageMilicores: v.number(),
    memoryUsageBytes: v.number(),
    diskUsageBytes: v.number(),
  },
  handler: async (ctx, args) => {
    // Get container to retrieve limits
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    const cpuLimit = container.config.cpuLimit ?? 500;
    const memoryLimit = container.config.memoryLimit ?? 512;
    const diskLimit = container.config.diskLimit ?? 5120;

    await recordResourceMetrics(
      ctx,
      args.accountId,
      args.containerId,
      args.cpuUsageMilicores,
      args.memoryUsageBytes,
      args.diskUsageBytes,
      cpuLimit,
      memoryLimit,
      diskLimit,
    );

    return {
      success: true,
      message: "Metrics recorded successfully",
    };
  },
});

/**
 * Internal: Check resource quota for container creation
 * Called during container.create mutation
 */
export const checkQuotaInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    cpuLimit: v.optional(v.number()),
    memoryLimit: v.optional(v.number()),
    diskLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cpuLimit = args.cpuLimit ?? 500;
    const memoryLimit = args.memoryLimit ?? 512;
    const diskLimit = args.diskLimit ?? 5120;

    const result = await checkResourceQuota(
      ctx,
      args.accountId,
      cpuLimit,
      memoryLimit,
      diskLimit,
    );

    return result;
  },
});

/**
 * Internal: Increment resource usage after container creation
 */
export const incrementUsageInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    cpuDelta: v.optional(v.number()),
    memoryDelta: v.optional(v.number()),
    diskDelta: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cpuDelta = args.cpuDelta ?? 0;
    const memoryDelta = args.memoryDelta ?? 0;
    const diskDelta = args.diskDelta ?? 0;

    await incrementResourceUsage(ctx, args.accountId, cpuDelta, memoryDelta, diskDelta);

    return {
      success: true,
      message: "Resource usage incremented",
    };
  },
});

/**
 * Internal: Decrement resource usage after container deletion
 */
export const decrementUsageInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    cpuDelta: v.optional(v.number()),
    memoryDelta: v.optional(v.number()),
    diskDelta: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cpuDelta = args.cpuDelta ?? 0;
    const memoryDelta = args.memoryDelta ?? 0;
    const diskDelta = args.diskDelta ?? 0;

    await decrementResourceUsage(ctx, args.accountId, cpuDelta, memoryDelta, diskDelta);

    return {
      success: true,
      message: "Resource usage decremented",
    };
  },
});

/**
 * Admin: Get detailed resource report for an account
 */
export const getResourceReport = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);

    const quota = await getResourceQuota(ctx, args.accountId);
    const metrics = await getAccountResourceMetrics(ctx, args.accountId);

    const containers = await ctx.db
      .query("containers")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const containerDetails = await Promise.all(
      containers.map(async (container) => {
        const latest = await getContainerMetrics(ctx, container._id);
        return {
          id: container._id,
          name: container.name,
          imageTag: container.imageTag,
          status: container.status,
          cpuLimit: container.config.cpuLimit,
          memoryLimit: container.config.memoryLimit,
          diskLimit: container.config.diskLimit,
          metrics: latest
            ? {
                cpuUsage: latest.cpuUsageMilicores,
                cpuPercent: latest.cpuUsagePercent,
                memoryUsage: latest.memoryUsageBytes,
                memoryPercent: latest.memoryUsagePercent,
                diskUsage: latest.diskUsageBytes,
                diskPercent: latest.diskUsagePercent,
                alerts: {
                  cpu: latest.cpuThresholdExceeded,
                  memory: latest.memoryThresholdExceeded,
                  disk: latest.diskThresholdExceeded,
                },
              }
            : null,
          createdAt: container.createdAt,
          updatedAt: container.updatedAt,
        };
      }),
    );

    return {
      accountId: args.accountId,
      quotas: {
        perContainer: {
          maxCpu: quota.maxCpuPerContainer,
          maxMemory: quota.maxMemoryPerContainer,
          maxDisk: quota.maxDiskPerContainer,
        },
        aggregate: {
          maxCpu: quota.maxTotalCpu,
          maxMemory: quota.maxTotalMemory,
          maxDisk: quota.maxTotalDisk,
          currentCpuInUse: quota.currentTotalCpuInUse,
          currentMemoryInUse: quota.currentTotalMemoryInUse,
          currentDiskInUse: quota.currentTotalDiskInUse,
        },
      },
      containerCount: containers.length,
      containers: containerDetails,
      timestamp: Date.now(),
    };
  },
});
