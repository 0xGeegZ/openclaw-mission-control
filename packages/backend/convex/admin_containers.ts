/**
 * Admin container management functions.
 * Extends existing containers.ts with additional admin-specific operations.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireAccountAdmin, requireAccountMember } from "./lib/auth";
import { logActivity } from "./lib/activity";

/**
 * List all containers for an account with pagination.
 */
export const list_containers = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    status: v.optional(v.union(v.literal("provisioning"), v.literal("running"), v.literal("stopped"), v.literal("degraded"))),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    let query_result = ctx.db
      .query("containers")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId));

    // Filter by status if provided
    if (args.status) {
      query_result = query_result.filter((container) => 
        container.status === args.status
      );
    }

    const containers = await query_result
      .skip(offset)
      .take(limit)
      .collect();

    return {
      containers: containers.map((c) => ({
        id: c._id,
        name: c.name,
        imageTag: c.imageTag,
        status: c.status,
        config: c.config,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total: containers.length,
    };
  },
});

/**
 * Get a single container with metrics.
 */
export const get_container = query({
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

    return {
      id: container._id,
      name: container.name,
      imageTag: container.imageTag,
      status: container.status,
      config: container.config,
      createdAt: container.createdAt,
      updatedAt: container.updatedAt,
    };
  },
});

/**
 * Start a container.
 */
export const start_container = mutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    if (container.accountId !== args.accountId) {
      throw new Error("Container does not belong to this account");
    }

    await ctx.db.patch(args.containerId, {
      status: "running",
      updatedAt: Date.now(),
    });

    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_updated",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "container",
        targetId: args.containerId,
        targetName: container.name,
        meta: { action: "start" },
      });
    } catch {
      // Optional logging
    }

    return {
      success: true,
      message: `Container '${container.name}' started successfully`,
    };
  },
});

/**
 * Stop a container.
 */
export const stop_container = mutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    if (container.accountId !== args.accountId) {
      throw new Error("Container does not belong to this account");
    }

    await ctx.db.patch(args.containerId, {
      status: "stopped",
      updatedAt: Date.now(),
    });

    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_updated",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "container",
        targetId: args.containerId,
        targetName: container.name,
        meta: { action: "stop" },
      });
    } catch {
      // Optional logging
    }

    return {
      success: true,
      message: `Container '${container.name}' stopped successfully`,
    };
  },
});

/**
 * Restart a container.
 */
export const restart_container = mutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    if (container.accountId !== args.accountId) {
      throw new Error("Container does not belong to this account");
    }

    await ctx.db.patch(args.containerId, {
      status: "provisioning",
      updatedAt: Date.now(),
    });

    // Simulate restart: transition to running after a brief moment
    await new Promise((resolve) => setTimeout(resolve, 100));
    await ctx.db.patch(args.containerId, {
      status: "running",
      updatedAt: Date.now(),
    });

    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_updated",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "container",
        targetId: args.containerId,
        targetName: container.name,
        meta: { action: "restart" },
      });
    } catch {
      // Optional logging
    }

    return {
      success: true,
      message: `Container '${container.name}' restarted successfully`,
    };
  },
});

/**
 * Delete a container.
 */
export const delete_container = mutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    if (container.accountId !== args.accountId) {
      throw new Error("Container does not belong to this account");
    }

    await ctx.db.delete(args.containerId);

    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_deleted",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "container",
        targetId: args.containerId,
        targetName: container.name,
        meta: {},
      });
    } catch {
      // Optional logging
    }

    return {
      success: true,
      message: `Container '${container.name}' deleted successfully`,
    };
  },
});

/**
 * Bulk restart all containers for an account.
 */
export const bulk_restart_containers = mutation({
  args: {
    accountId: v.id("accounts"),
    containerIds: v.optional(v.array(v.id("containers"))),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    let containers = [];
    if (args.containerIds && args.containerIds.length > 0) {
      containers = await Promise.all(
        args.containerIds.map((id) => ctx.db.get(id))
      );
    } else {
      containers = await ctx.db
        .query("containers")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .collect();
    }

    let restarted = 0;
    for (const container of containers) {
      if (container && container.accountId === args.accountId) {
        await ctx.db.patch(container._id, {
          status: "provisioning",
          updatedAt: Date.now(),
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        await ctx.db.patch(container._id, {
          status: "running",
          updatedAt: Date.now(),
        });
        restarted++;
      }
    }

    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "bulk_action",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "containers",
        targetId: args.accountId,
        targetName: `Bulk restart: ${restarted} containers`,
        meta: { action: "bulk_restart", count: restarted },
      });
    } catch {
      // Optional logging
    }

    return {
      success: true,
      restarted,
      message: `Restarted ${restarted} container(s) successfully`,
    };
  },
});
