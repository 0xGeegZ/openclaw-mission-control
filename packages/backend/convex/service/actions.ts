import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireServiceAuth, generateServiceToken } from "../lib/service_auth";
import { Id } from "../_generated/dataModel";

/**
 * Service actions for runtime service.
 * These actions validate service tokens and call internal queries/mutations.
 * 
 * The runtime service calls these actions (not internal mutations directly)
 * because internal mutations cannot be called from HTTP clients.
 */

/**
 * Provision a service token for an account.
 * Generates a secure token and stores its hash in the account.
 * Called when setting up a runtime server for an account.
 * 
 * Requires account owner/admin role.
 */
export const provisionServiceToken = action({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ token: string }> => {
    // Verify user is authenticated and has owner/admin role
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized: Must be authenticated");
    }
    
    // Check account membership and role
    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    
    if (!account) {
      throw new Error("Not found: Account does not exist");
    }
    
    // Check membership
    const membership = await ctx.runQuery(internal.memberships.getByAccountUser, {
      accountId: args.accountId,
      userId: identity.subject,
    });
    
    if (!membership) {
      throw new Error("Forbidden: Not a member of this account");
    }
    
    // Require owner or admin role
    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Forbidden: Requires owner or admin role");
    }
    
    // Generate token and hash
    const { token, hash } = await generateServiceToken(args.accountId);
    
    // Store hash in account
    await ctx.runMutation(internal.accounts.updateServiceTokenHash, {
      accountId: args.accountId,
      serviceTokenHash: hash,
    });
    
    // Return plaintext token (caller must store securely)
    return { token };
  },
});

/**
 * Check if restart was requested and clear the flag if set.
 * Called by runtime on each health cycle; if true, runtime should exit so process manager restarts it.
 */
export const checkAndClearRestartRequested = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ restartRequested: boolean }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    const restartRequestedAt = account?.restartRequestedAt;
    if (restartRequestedAt != null) {
      await ctx.runMutation(internal.accounts.clearRestartRequestedInternal, {
        accountId: args.accountId,
      });
      return { restartRequested: true };
    }
    return { restartRequested: false };
  },
});

/**
 * Update account runtime status.
 * Called by runtime service to report health status.
 */
export const updateRuntimeStatus = action({
  args: {
    accountId: v.id("accounts"),
    status: v.union(
      v.literal("provisioning"),
      v.literal("online"),
      v.literal("degraded"),
      v.literal("offline"),
      v.literal("error")
    ),
    serviceToken: v.string(),
    config: v.optional(v.object({
      dropletId: v.string(),
      ipAddress: v.string(),
      region: v.optional(v.string()),
      lastHealthCheck: v.optional(v.number()),
      openclawVersion: v.optional(v.string()),
      runtimeServiceVersion: v.optional(v.string()),
      lastUpgradeAt: v.optional(v.number()),
      lastUpgradeStatus: v.optional(v.union(
        v.literal("success"),
        v.literal("failed"),
        v.literal("rolled_back")
      )),
    })),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Validate service token and verify account matches
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    
    // Call internal mutation
    await ctx.runMutation(internal.accounts.updateRuntimeStatusInternal, {
      accountId: args.accountId,
      status: args.status,
      config: args.config,
    });
    
    return { success: true };
  },
});

/**
 * List undelivered notifications for an account.
 * Called by runtime to fetch notifications to deliver.
 */
export const listUndeliveredNotifications = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any[]> => {
    // Validate service token and verify account matches
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    
    // Call internal query
    return await ctx.runQuery(internal.service.notifications.listUndeliveredForAccount, {
      accountId: args.accountId,
      limit: args.limit,
    });
  },
});

/**
 * Get notification details for delivery.
 * Called by runtime to get full context for a notification.
 */
export const getNotificationForDelivery = action({
  args: {
    notificationId: v.id("notifications"),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<any> => {
    // Validate service token
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    
    // Call internal query
    const result = await ctx.runQuery(internal.service.notifications.getForDelivery, {
      notificationId: args.notificationId,
    });
    
    if (result && result.notification && result.notification.accountId !== args.accountId) {
      throw new Error("Forbidden: Notification belongs to different account");
    }
    
    return result;
  },
});

/**
 * Mark a notification as delivered.
 * Called by runtime after successfully delivering to OpenClaw.
 */
export const markNotificationDelivered = action({
  args: {
    notificationId: v.id("notifications"),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Validate service token
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    
    // Verify account matches
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    
    // Verify notification belongs to this account using internal query
    const notificationResult = await ctx.runQuery(internal.service.notifications.getForDelivery, {
      notificationId: args.notificationId,
    });
    
    const notification = notificationResult?.notification;
    
    if (!notification) {
      throw new Error("Not found: Notification does not exist");
    }
    
    if (notification.accountId !== args.accountId) {
      throw new Error("Forbidden: Notification belongs to different account");
    }
    
    // Call internal mutation
    await ctx.runMutation(internal.service.notifications.markDelivered, {
      notificationId: args.notificationId,
    });
    
    return { success: true };
  },
});

/**
 * List agents for an account.
 * Called by runtime to get all agents for the account.
 */
export const listAgents = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
  },
  handler: async (ctx, args): Promise<any[]> => {
    // Validate service token and verify account matches
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    
    // Call internal query
    return await ctx.runQuery(internal.service.agents.listInternal, {
      accountId: args.accountId,
    });
  },
});

/**
 * Update agent heartbeat.
 * Called by runtime when agent completes heartbeat cycle.
 */
export const updateAgentHeartbeat = action({
  args: {
    agentId: v.id("agents"),
    status: v.union(
      v.literal("online"),
      v.literal("busy"),
      v.literal("idle"),
      v.literal("offline"),
      v.literal("error")
    ),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
    currentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args): Promise<{ success: boolean; timestamp: number }> => {
    // Validate service token
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    
    // Verify account matches
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    
    // Verify agent belongs to this account using internal query
    const agent = await ctx.runQuery(internal.service.agents.getInternal, {
      agentId: args.agentId,
    });
    
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    if (agent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent belongs to different account");
    }
    
    // Call internal mutation
    const result: { success: boolean; timestamp: number } = await ctx.runMutation(internal.service.agents.upsertHeartbeat, {
      agentId: args.agentId,
      status: args.status,
      currentTaskId: args.currentTaskId,
    });
    
    return result;
  },
});

/**
 * Create a message from an agent.
 * Called by runtime when agent posts to a thread.
 */
export const createMessageFromAgent = action({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    content: v.string(),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
    attachments: v.optional(v.array(v.object({
      type: v.string(),
      url: v.string(),
      name: v.string(),
      size: v.number(),
    }))),
  },
  handler: async (ctx, args): Promise<{ messageId: Id<"messages"> }> => {
    // Validate service token
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    
    // Verify account matches
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    
    // Verify agent belongs to this account using internal query
    const agent = await ctx.runQuery(internal.service.agents.getInternal, {
      agentId: args.agentId,
    });
    
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    if (agent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent belongs to different account");
    }
    
    // Verify task belongs to this account using internal query
    const task = await ctx.runQuery(internal.service.agents.getTaskInternal, {
      taskId: args.taskId,
    });
    
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    if (task.accountId !== args.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }
    
    // Call internal mutation
    const messageId: Id<"messages"> = await ctx.runMutation(internal.service.messages.createFromAgent, {
      agentId: args.agentId,
      taskId: args.taskId,
      content: args.content,
      attachments: args.attachments,
    });
    
    return { messageId };
  },
});

/** Pending upgrade payload returned to runtime. */
type PendingUpgradePayload = {
  targetOpenclawVersion: string;
  targetRuntimeVersion: string;
  initiatedAt: number;
  initiatedBy: string;
  strategy: "immediate" | "rolling" | "canary";
} | null;

/**
 * Get pending upgrade for the account's runtime (service only).
 * Called by runtime on each health cycle to decide whether to apply an upgrade.
 */
export const getPendingUpgrade = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
  },
  handler: async (ctx, args): Promise<PendingUpgradePayload> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    const runtime = await ctx.runQuery(internal.runtimes.getByAccountInternal, {
      accountId: args.accountId,
    });
    return (runtime?.pendingUpgrade ?? null) as PendingUpgradePayload;
  },
});

/**
 * Record upgrade result after runtime applies or fails an upgrade (service only).
 */
export const recordUpgradeResult = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("rolled_back")
    ),
    fromOpenclawVersion: v.string(),
    toOpenclawVersion: v.string(),
    fromRuntimeVersion: v.string(),
    toRuntimeVersion: v.string(),
    duration: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    const runtime = await ctx.runQuery(internal.runtimes.getByAccountInternal, {
      accountId: args.accountId,
    });
    const initiatedBy = runtime?.pendingUpgrade?.initiatedBy ?? "runtime";
    await ctx.runMutation(internal.runtimes.recordUpgradeResultInternal, {
      accountId: args.accountId,
      status: args.status,
      fromOpenclawVersion: args.fromOpenclawVersion,
      toOpenclawVersion: args.toOpenclawVersion,
      fromRuntimeVersion: args.fromRuntimeVersion,
      toRuntimeVersion: args.toRuntimeVersion,
      duration: args.duration,
      error: args.error,
      initiatedBy,
    });
    return { success: true };
  },
});
