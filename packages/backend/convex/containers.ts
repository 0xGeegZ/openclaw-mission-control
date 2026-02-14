import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAccountMember, requireAccountAdmin } from "./lib/auth";
import { logActivity } from "./lib/activity";

/**
 * Container resource limits by plan tier.
 * Maps account plan to CPU and memory allocations.
 */
const PLAN_RESOURCE_LIMITS: Record<string, { cpus: string; memory: string }> = {
  starter: { cpus: "0.5", memory: "512M" },
  pro: { cpus: "1.0", memory: "1024M" },
  enterprise: { cpus: "2.0", memory: "2048M" },
};

/**
 * Allocate next available port from the dynamic port range.
 * Returns a port in the 5000-15000 range that is not already assigned.
 *
 * @param ctx Convex context
 * @returns Available port number
 * @throws Error if no ports available (exceeds 10k container limit)
 */
async function getNextAvailablePort(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  const allContainers = await ctx.db.query("containers").collect();
  const usedPorts = new Set(allContainers.map((c) => c.assignedPort));

  for (let port = 5000; port < 15000; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error("No available ports; container limit (10k) reached");
}

/**
 * Get resource limits for a given account plan.
 *
 * @param plan Account plan tier
 * @returns CPU and memory limits
 * @throws Error if plan not recognized
 */
function getPlanLimits(plan: string): { cpus: string; memory: string } {
  const limits = PLAN_RESOURCE_LIMITS[plan];
  if (!limits) {
    throw new Error(`Unknown plan: ${plan}`);
  }
  return limits;
}

/**
 * Create a new container for a customer.
 * Sets status="creating" and spawns async OS-level docker provisioning.
 *
 * Requires: account admin access
 *
 * @param accountId The account to provision a container for
 * @returns Container ID, status, and assigned port
 */
export const createContainer = internalMutation({
  args: {
    accountId: v.id("accounts"),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate account exists
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error(`Account not found: ${args.accountId}`);
    }

    // Get next available port
    const assignedPort = await getNextAvailablePort(ctx);

    // Get resource limits for plan
    const resourceLimits = getPlanLimits(args.plan || account.plan);

    // Create container record with status="creating"
    const containerId = await ctx.db.insert("containers", {
      accountId: args.accountId,
      containerName: `customer-${args.accountId.slice(0, 8)}`,
      status: "creating",
      assignedPort,
      resourceLimits,
      healthChecksPassed: 0,
      lastHealthCheck: undefined,
      errorLog: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "container_created",
      actorType: "system",
      actorId: "system",
      actorName: "System",
      targetType: "container",
      targetId: containerId,
      targetName: `customer-${args.accountId.slice(0, 8)}`,
      meta: {
        port: assignedPort,
        plan: args.plan || account.plan,
        cpus: resourceLimits.cpus,
        memory: resourceLimits.memory,
      },
    });

    // Phase 1B: Spawn async orchestration action to provision container
    // Schedules the executeCreate action to run immediately
    // This updates container status from "creating" to "running" or "failed"
    await ctx.scheduler.runAfter(0, internal.orchestration.executeCreate, {
      accountId: args.accountId,
      containerId,
      assignedPort,
      plan: args.plan || account.plan,
    });

    return {
      containerId,
      status: "creating",
      assignedPort,
      resourceLimits,
    };
  },
});

/**
 * Delete a container and clean up its resources.
 * Sets status="deleted" and spawns async docker cleanup.
 *
 * Requires: account admin access
 *
 * @param containerId The container to delete
 * @returns Updated container record
 */
export const deleteContainer = internalMutation({
  args: {
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    const updated = await ctx.db.patch(args.containerId, {
      status: "deleted",
      updatedAt: Date.now(),
    });

    await logActivity({
      ctx,
      accountId: container.accountId,
      type: "container_deleted",
      actorType: "system",
      actorId: "system",
      actorName: "System",
      targetType: "container",
      targetId: args.containerId,
      targetName: container.containerName,
      meta: { port: container.assignedPort },
    });

    // Phase 1B: Spawn async orchestration action to delete container
    // Schedules the executeDelete action to clean up resources
    await ctx.scheduler.runAfter(0, internal.orchestration.executeDelete, {
      accountId: container.accountId,
      containerId: args.containerId,
    });

    return updated;
  },
});

/**
 * Restart a running container.
 * Resets health checks and spawns async docker restart.
 *
 * Requires: account admin access
 *
 * @param containerId The container to restart
 * @returns Updated container record
 */
export const restartContainer = internalMutation({
  args: {
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    if (container.status !== "running") {
      throw new Error(
        `Cannot restart container ${args.containerId} in ${container.status} state`,
      );
    }

    const updated = await ctx.db.patch(args.containerId, {
      healthChecksPassed: 0,
      updatedAt: Date.now(),
    });

    await logActivity({
      ctx,
      accountId: container.accountId,
      type: "container_restarted",
      actorType: "system",
      actorId: "system",
      actorName: "System",
      targetType: "container",
      targetId: args.containerId,
      targetName: container.containerName,
      meta: { port: container.assignedPort },
    });

    // Phase 1B: Spawn async orchestration action to restart container
    // Schedules the executeRestart action to trigger docker restart
    await ctx.scheduler.runAfter(0, internal.orchestration.executeRestart, {
      accountId: container.accountId,
      containerId: args.containerId,
    });

    return updated;
  },
});

/**
 * Log a health check failure to the error log.
 * Called by the health check daemon every 30 seconds.
 *
 * @param containerId The container that failed health check
 * @param message Error message
 */
export const logContainerError = internalMutation({
  args: {
    containerId: v.id("containers"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    // Append to error log
    const updated = await ctx.db.patch(args.containerId, {
      errorLog: [
        ...container.errorLog,
        {
          timestamp: Date.now(),
          message: args.message,
        },
      ],
      updatedAt: Date.now(),
    });

    return updated;
  },
});

/**
 * Update health check status for a container.
 * Called by health check daemon to track consecutive passes/failures.
 *
 * @param containerId The container being checked
 * @param passed Whether the health check passed
 */
export const updateContainerHealthStatus = internalMutation({
  args: {
    containerId: v.id("containers"),
    passed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    let newHealthChecksPassed = args.passed
      ? container.healthChecksPassed + 1
      : 0;
    let newStatus = container.status;

    // Mark as failed after 3 consecutive health check failures (while running)
    if (
      !args.passed &&
      container.healthChecksPassed >= 3 &&
      container.status === "running"
    ) {
      newStatus = "failed";
      newHealthChecksPassed = 0;

      // Log the failure
      await logActivity({
        ctx,
        accountId: container.accountId,
        type: "container_failed",
        actorType: "system",
        actorId: "system",
        actorName: "System",
        targetType: "container",
        targetId: args.containerId,
        targetName: container.containerName,
        meta: {
          port: container.assignedPort,
          reason: "Health check failures threshold exceeded",
        },
      });

      // Phase 1B: Trigger automatic restart via orchestration script
    }

    const updated = await ctx.db.patch(args.containerId, {
      healthChecksPassed: newHealthChecksPassed,
      lastHealthCheck: Date.now(),
      status: newStatus,
      updatedAt: Date.now(),
    });

    return updated;
  },
});

/**
 * List all containers for an account.
 * Requires: account membership
 *
 * @param accountId The account to list containers for
 * @returns Array of containers
 */
export const listAccountContainers = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    return await ctx.db
      .query("containers")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

/**
 * Get a single container by ID.
 * Requires: account membership
 *
 * @param containerId The container to fetch
 * @returns Container record
 */
export const getContainer = query({
  args: {
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error("Container not found");
    }

    // Require membership in the container's account
    await requireAccountMember(ctx, container.accountId);

    return container;
  },
});

/**
 * List containers by status (internal query for health check daemon).
 * No auth required; for use in service actions.
 *
 * @param status Status to filter by
 * @returns Array of containers
 */
export const getContainersByStatus = internalQuery({
  args: {
    status: v.union(
      v.literal("creating"),
      v.literal("running"),
      v.literal("stopped"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("containers")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

/**
 * List failed containers for alerting/monitoring.
 * Internal query for use in monitoring dashboards.
 *
 * @param accountId Optional: filter by account
 * @returns Array of failed containers
 */
export const getFailedContainers = internalQuery({
  args: {
    accountId: v.optional(v.id("accounts")),
  },
  handler: async (ctx, args) => {
    if (args.accountId) {
      // Use by_account_status index for efficient filtering
      const accountId = args.accountId;
      return await ctx.db
        .query("containers")
        .withIndex("by_account_status", (q) =>
          q.eq("accountId", accountId).eq("status", "failed"),
        )
        .collect();
    }

    // Query all failed containers when no account filter
    return await ctx.db
      .query("containers")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();
  },
});
