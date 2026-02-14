/**
 * Container management and quota enforcement.
 * Manages Docker containers provisioned for accounts.
 * Enforces subscription quotas before creation.
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { checkQuota, incrementUsage, decrementUsage } from "./lib/quotaHelpers";
import { requireAccountAdmin, requireAccountMember } from "./lib/auth";
import { logActivity } from "./lib/activity";
import {
  checkResourceQuota,
  incrementResourceUsage,
  decrementResourceUsage,
} from "./lib/resourceHelpers";

/**
 * Create a new container for an account.
 * Enforces subscription and resource quotas before creation.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.string(),
    imageTag: v.string(),
    config: v.optional(
      v.object({
        cpuLimit: v.optional(v.number()),
        memoryLimit: v.optional(v.number()),
        diskLimit: v.optional(v.number()),
        envVars: v.optional(v.object({})),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    // Check container count quota before proceeding
    const quotaCheck = await checkQuota(ctx, args.accountId, "containers");
    if (!quotaCheck.allowed) {
      throw new Error(
        `Quota exceeded: ${quotaCheck.message}. Upgrade your plan to create more containers.`,
      );
    }

    // Get account for audit
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error(`Account not found: ${args.accountId}`);
    }

    // Set default resource limits
    const cpuLimit = args.config?.cpuLimit ?? 500; // 0.5 cores
    const memoryLimit = args.config?.memoryLimit ?? 512; // 512 MB
    const diskLimit = args.config?.diskLimit ?? 5120; // 5 GB

    // Check resource quotas
    const resourceQuotaCheck = await checkResourceQuota(
      ctx,
      args.accountId,
      cpuLimit,
      memoryLimit,
      diskLimit,
    );
    if (!resourceQuotaCheck.allowed) {
      throw new Error(
        `Resource quota exceeded: ${resourceQuotaCheck.message}`,
      );
    }

    // Create container
    const containerId = await ctx.db.insert("containers", {
      accountId: args.accountId,
      name: args.name,
      imageTag: args.imageTag,
      config: {
        cpuLimit,
        memoryLimit,
        diskLimit,
        envVars: args.config?.envVars || {},
      },
      status: "provisioning",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Increment usage quotas
    await incrementUsage(ctx, args.accountId, "containers");
    await incrementResourceUsage(ctx, args.accountId, cpuLimit, memoryLimit, diskLimit);

    // Log activity for audit trail
    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_created",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "container",
        targetId: containerId,
        targetName: args.name,
        meta: {
          imageTag: args.imageTag,
          cpuLimit,
          memoryLimit,
          diskLimit,
        },
      });
    } catch {
      // Activity logging is optional; continue if it fails
    }

    return {
      success: true,
      containerId,
      message: `Container '${args.name}' created successfully`,
      resourceLimits: {
        cpu: cpuLimit,
        memory: memoryLimit,
        disk: diskLimit,
      },
    };
  },
});

/**
 * Delete a container from an account.
 * Decrements quota usage after deletion.
 */
export const remove = mutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    // Get container
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    // Verify ownership
    if (container.accountId !== args.accountId) {
      throw new Error("Container does not belong to this account");
    }

    // Delete container
    await ctx.db.delete(args.containerId);

    // Decrement usage quotas
    await decrementUsage(ctx, args.accountId, "containers");
    const cpuLimit = container.config.cpuLimit ?? 500;
    const memoryLimit = container.config.memoryLimit ?? 512;
    const diskLimit = container.config.diskLimit ?? 5120;
    await decrementResourceUsage(ctx, args.accountId, cpuLimit, memoryLimit, diskLimit);

    // Get account for audit
    const account = await ctx.db.get(args.accountId);

    // Log activity for audit trail
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
        meta: {
          cpuLimit,
          memoryLimit,
          diskLimit,
        },
      });
    } catch {
      // Activity logging is optional; continue if it fails
    }

    return {
      success: true,
      message: `Container '${container.name}' deleted successfully`,
    };
  },
});

/**
 * Get container details.
 */
export const get = query({
  args: {
    containerId: v.id("containers"),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    // Verify ownership
    if (container.accountId !== args.accountId) {
      throw new Error("Container does not belong to this account");
    }

    return container;
  },
});

/**
 * List containers for an account.
 */
export const listByAccount = query({
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
