/**
 * Resource management helpers.
 * Handles resource limit enforcement, quota checking, and monitoring.
 */
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { ACCOUNT_PLAN } from "./constants";

/**
 * Resource limit defaults per plan
 */
export const RESOURCE_LIMITS = {
  [ACCOUNT_PLAN.FREE]: {
    maxContainers: 1,
    maxCpuPerContainer: 500, // 0.5 cores in millicores
    maxMemoryPerContainer: 512, // 512 MB
    maxDiskPerContainer: 5120, // 5 GB
    maxTotalCpu: 500,
    maxTotalMemory: 512,
    maxTotalDisk: 5120,
  },
  [ACCOUNT_PLAN.PRO]: {
    maxContainers: 5,
    maxCpuPerContainer: 2000, // 2 cores
    maxMemoryPerContainer: 4096, // 4 GB
    maxDiskPerContainer: 51200, // 50 GB
    maxTotalCpu: 4000,
    maxTotalMemory: 8192,
    maxTotalDisk: 102400,
  },
  [ACCOUNT_PLAN.ENTERPRISE]: {
    maxContainers: 50,
    maxCpuPerContainer: 8000, // 8 cores
    maxMemoryPerContainer: 32768, // 32 GB
    maxDiskPerContainer: 512000, // 500 GB
    maxTotalCpu: 64000,
    maxTotalMemory: 262144,
    maxTotalDisk: 5120000,
  },
};

/**
 * Get resource quota for an account
 */
export async function getResourceQuota(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">,
) {
  const account = await ctx.db.get(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const quota = await ctx.db
    .query("resourceQuotas")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .first();

  if (!quota) {
    // Initialize quota if it doesn't exist
    const limits = RESOURCE_LIMITS[account.plan];
    const newQuotaId = await ctx.db.insert("resourceQuotas", {
      accountId,
      planId: account.plan,
      maxCpuPerContainer: limits.maxCpuPerContainer,
      maxMemoryPerContainer: limits.maxMemoryPerContainer,
      maxDiskPerContainer: limits.maxDiskPerContainer,
      maxTotalCpu: limits.maxTotalCpu,
      maxTotalMemory: limits.maxTotalMemory,
      maxTotalDisk: limits.maxTotalDisk,
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
      updatedAt: Date.now(),
    });

    return {
      _id: newQuotaId,
      accountId,
      planId: account.plan,
      ...limits,
      currentTotalCpuInUse: 0,
      currentTotalMemoryInUse: 0,
      currentTotalDiskInUse: 0,
      updatedAt: Date.now(),
    };
  }

  return quota;
}

/**
 * Check if container resource request exceeds quota
 */
export async function checkResourceQuota(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">,
  requestedCpu: number,
  requestedMemory: number,
  requestedDisk: number,
): Promise<{
  allowed: boolean;
  message?: string;
}> {
  const quota = await getResourceQuota(ctx, accountId);

  // Check per-container limits
  if (requestedCpu > quota.maxCpuPerContainer) {
    return {
      allowed: false,
      message: `CPU limit (${requestedCpu}m) exceeds per-container max (${quota.maxCpuPerContainer}m)`,
    };
  }

  if (requestedMemory > quota.maxMemoryPerContainer) {
    return {
      allowed: false,
      message: `Memory limit (${requestedMemory}MB) exceeds per-container max (${quota.maxMemoryPerContainer}MB)`,
    };
  }

  if (requestedDisk > quota.maxDiskPerContainer) {
    return {
      allowed: false,
      message: `Disk limit (${requestedDisk}MB) exceeds per-container max (${quota.maxDiskPerContainer}MB)`,
    };
  }

  // Check aggregate limits
  const availableCpu = quota.maxTotalCpu - quota.currentTotalCpuInUse;
  const availableMemory = quota.maxTotalMemory - quota.currentTotalMemoryInUse;
  const availableDisk = quota.maxTotalDisk - quota.currentTotalDiskInUse;

  if (requestedCpu > availableCpu) {
    return {
      allowed: false,
      message: `Insufficient CPU quota. Available: ${availableCpu}m, Requested: ${requestedCpu}m`,
    };
  }

  if (requestedMemory > availableMemory) {
    return {
      allowed: false,
      message: `Insufficient memory quota. Available: ${availableMemory}MB, Requested: ${requestedMemory}MB`,
    };
  }

  if (requestedDisk > availableDisk) {
    return {
      allowed: false,
      message: `Insufficient disk quota. Available: ${availableDisk}MB, Requested: ${requestedDisk}MB`,
    };
  }

  return { allowed: true };
}

/**
 * Update resource quota usage after container creation
 */
export async function incrementResourceUsage(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  cpuDelta: number,
  memoryDelta: number,
  diskDelta: number,
) {
  const quota = await getResourceQuota(ctx, accountId);

  await ctx.db.patch(quota._id, {
    currentTotalCpuInUse: quota.currentTotalCpuInUse + cpuDelta,
    currentTotalMemoryInUse: quota.currentTotalMemoryInUse + memoryDelta,
    currentTotalDiskInUse: quota.currentTotalDiskInUse + diskDelta,
    updatedAt: Date.now(),
  });
}

/**
 * Update resource quota usage after container deletion
 */
export async function decrementResourceUsage(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  cpuDelta: number,
  memoryDelta: number,
  diskDelta: number,
) {
  const quota = await getResourceQuota(ctx, accountId);

  await ctx.db.patch(quota._id, {
    currentTotalCpuInUse: Math.max(0, quota.currentTotalCpuInUse - cpuDelta),
    currentTotalMemoryInUse: Math.max(0, quota.currentTotalMemoryInUse - memoryDelta),
    currentTotalDiskInUse: Math.max(0, quota.currentTotalDiskInUse - diskDelta),
    updatedAt: Date.now(),
  });
}

/**
 * Get latest resource metrics for a container
 */
export async function getContainerMetrics(
  ctx: QueryCtx | MutationCtx,
  containerId: Id<"containers">,
) {
  return await ctx.db
    .query("resourceMetrics")
    .withIndex("by_container", (q) => q.eq("containerId", containerId))
    .order("desc")
    .first();
}

/**
 * Record resource metrics for a container
 * Called by monitoring system
 */
export async function recordResourceMetrics(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  containerId: Id<"containers">,
  cpuUsageMilicores: number,
  memoryUsageBytes: number,
  diskUsageBytes: number,
  cpuLimit: number = 0,
  memoryLimitMB: number = 0,
  diskLimitMB: number = 0,
) {
  // Calculate percentages
  const cpuPercent = cpuLimit > 0 ? (cpuUsageMilicores / cpuLimit) * 100 : 0;
  const memoryPercent = memoryLimitMB > 0 ? (memoryUsageBytes / (memoryLimitMB * 1024 * 1024)) * 100 : 0;
  const diskPercent = diskLimitMB > 0 ? (diskUsageBytes / (diskLimitMB * 1024 * 1024)) * 100 : 0;

  // Determine if thresholds exceeded (80%)
  const cpuThresholdExceeded = cpuPercent > 80;
  const memoryThresholdExceeded = memoryPercent > 80;
  const diskThresholdExceeded = diskPercent > 80;

  await ctx.db.insert("resourceMetrics", {
    accountId,
    containerId,
    cpuUsageMilicores,
    cpuUsagePercent: Math.min(100, cpuPercent),
    memoryUsageBytes,
    memoryUsagePercent: Math.min(100, memoryPercent),
    diskUsageBytes,
    diskUsagePercent: Math.min(100, diskPercent),
    cpuThresholdExceeded,
    memoryThresholdExceeded,
    diskThresholdExceeded,
    recordedAt: Date.now(),
    lastUpdateAt: Date.now(),
  });
}

/**
 * Get resource metrics history for a container (last N records)
 */
export async function getContainerMetricsHistory(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">,
  containerId: Id<"containers">,
  limit: number = 24,
) {
  return await ctx.db
    .query("resourceMetrics")
    .withIndex("by_account_container", (q) =>
      q.eq("accountId", accountId).eq("containerId", containerId),
    )
    .order("desc")
    .take(limit);
}

/**
 * Get aggregate metrics for all containers in an account
 */
export async function getAccountResourceMetrics(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">,
) {
  const containers = await ctx.db
    .query("containers")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();

  if (containers.length === 0) {
    return {
      totalCpuUsage: 0,
      totalMemoryUsage: 0,
      totalDiskUsage: 0,
      containerMetrics: [],
    };
  }

  const metrics = await Promise.all(
    containers.map(async (container) => {
      const latest = await getContainerMetrics(ctx, container._id);
      return {
        containerId: container._id,
        containerName: container.name,
        ...latest,
      };
    }),
  );

  const totalCpuUsage = metrics.reduce(
    (sum, m) => sum + (m?.cpuUsageMilicores ?? 0),
    0,
  );
  const totalMemoryUsage = metrics.reduce(
    (sum, m) => sum + (m?.memoryUsageBytes ?? 0),
    0,
  );
  const totalDiskUsage = metrics.reduce(
    (sum, m) => sum + (m?.diskUsageBytes ?? 0),
    0,
  );

  return {
    totalCpuUsage,
    totalMemoryUsage,
    totalDiskUsage,
    containerMetrics: metrics.filter((m) => m !== null),
  };
}
