import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  requireServiceAuth,
  generateServiceToken,
  hashServiceTokenSecret,
} from "../lib/service_auth";
import { taskStatusValidator, documentTypeValidator } from "../lib/validators";
import { Doc, Id } from "../_generated/dataModel";
import type { GetForDeliveryResult } from "./notifications";
import {
  resolveBehaviorFlags,
  type BehaviorFlags,
} from "../lib/behavior_flags";
import { TASK_STATUS_TRANSITIONS, type TaskStatus } from "../lib/task_workflow";

export type { BehaviorFlags };

/**
 * Find a shortest valid status path from `from` to `to`.
 * Returns the list of *next* statuses to apply (excludes the current status).
 *
 * Note: We restrict intermediate steps to statuses the runtime is allowed to set
 * (in_progress | review | done | blocked). This avoids paths that require setting
 * inbox/assigned, which are intentionally not exposed for service status updates.
 */
function findStatusPath(options: {
  from: TaskStatus;
  to: TaskStatus;
  allowedNextStatuses: ReadonlySet<TaskStatus>;
}): TaskStatus[] | null {
  const { from, to, allowedNextStatuses } = options;
  if (from === to) return [];

  const visited = new Set<TaskStatus>([from]);
  const queue: TaskStatus[] = [from];
  const prev = new Map<TaskStatus, TaskStatus>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextStatuses = TASK_STATUS_TRANSITIONS[current] ?? [];
    for (const next of nextStatuses) {
      if (!allowedNextStatuses.has(next)) continue;
      if (visited.has(next)) continue;

      visited.add(next);
      prev.set(next, current);
      if (next === to) {
        const path: TaskStatus[] = [];
        let node: TaskStatus | undefined = to;
        while (node && node !== from) {
          path.push(node);
          node = prev.get(node);
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }

  return null;
}

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
    const membership = await ctx.runQuery(
      internal.memberships.getByAccountUser,
      {
        accountId: args.accountId,
        userId: identity.subject,
      },
    );

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
 * Sync a provided service token to an account by storing its hash.
 * Useful when you already have a token in env and need Convex to accept it.
 *
 * Requires account owner/admin role.
 */
export const syncServiceToken = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
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

    const membership = await ctx.runQuery(
      internal.memberships.getByAccountUser,
      {
        accountId: args.accountId,
        userId: identity.subject,
      },
    );

    if (!membership) {
      throw new Error("Forbidden: Not a member of this account");
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Forbidden: Requires owner or admin role");
    }

    const token = args.serviceToken.trim();
    if (!token.startsWith("mc_service_")) {
      throw new Error("Invalid service token format");
    }

    const parts = token.split("_");
    if (parts.length < 4) {
      throw new Error("Invalid service token structure");
    }

    const tokenAccountId = parts[2] as Id<"accounts">;
    if (tokenAccountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const secret = parts.slice(3).join("_");
    const hash = await hashServiceTokenSecret(secret);

    await ctx.runMutation(internal.accounts.updateServiceTokenHash, {
      accountId: args.accountId,
      serviceTokenHash: hash,
    });

    return { success: true };
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
      v.literal("error"),
    ),
    serviceToken: v.string(),
    config: v.optional(
      v.object({
        dropletId: v.string(),
        ipAddress: v.string(),
        region: v.optional(v.string()),
        lastHealthCheck: v.optional(v.number()),
        openclawVersion: v.optional(v.string()),
        runtimeServiceVersion: v.optional(v.string()),
        lastUpgradeAt: v.optional(v.number()),
        lastUpgradeStatus: v.optional(
          v.union(
            v.literal("success"),
            v.literal("failed"),
            v.literal("rolled_back"),
          ),
        ),
      }),
    ),
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
  handler: async (ctx, args): Promise<Doc<"notifications">[]> => {
    // Validate service token and verify account matches
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);

    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    // Call internal query
    return await ctx.runQuery(
      internal.service.notifications.listUndeliveredForAccount,
      {
        accountId: args.accountId,
        limit: args.limit,
      },
    );
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
  handler: async (ctx, args): Promise<GetForDeliveryResult | null> => {
    // Validate service token
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);

    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    // Call internal query
    const result = await ctx.runQuery(
      internal.service.notifications.getForDelivery,
      {
        notificationId: args.notificationId,
      },
    );

    if (
      result &&
      result.notification &&
      result.notification.accountId !== args.accountId
    ) {
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
    const notificationResult = await ctx.runQuery(
      internal.service.notifications.getForDelivery,
      {
        notificationId: args.notificationId,
      },
    );

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
 * Mark a notification as read (service-only).
 * Called by runtime when it starts processing a notification, before sendToOpenClaw.
 * Verifies notification belongs to account; idempotent.
 */
export const markNotificationRead = action({
  args: {
    notificationId: v.id("notifications"),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    const notificationResult = await ctx.runQuery(
      internal.service.notifications.getForDelivery,
      { notificationId: args.notificationId },
    );
    const notification = notificationResult?.notification;
    if (!notification) {
      throw new Error("Not found: Notification does not exist");
    }
    if (notification.accountId !== args.accountId) {
      throw new Error("Forbidden: Notification belongs to different account");
    }
    await ctx.runMutation(internal.service.notifications.markRead, {
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

/** One agent from listForRuntime (for profile sync). */
interface AgentForRuntimePayload {
  _id: Id<"agents">;
  name: string;
  slug: string;
  role: string;
  sessionKey: string;
  openclawConfig: Doc<"agents">["openclawConfig"];
  effectiveSoulContent: string;
  resolvedSkills: Array<{
    _id: Id<"skills">;
    name: string;
    slug: string;
    description: string | undefined;
  }>;
}

/**
 * List agents for runtime profile sync (SOUL, skills, openclaw config).
 * Returns effectiveSoulContent and resolved skill metadata for OpenClaw workspace generation.
 */
export const listAgentsForRuntime = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
  },
  handler: async (ctx, args): Promise<AgentForRuntimePayload[]> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }
    return await ctx.runQuery(internal.service.agents.listForRuntime, {
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
      v.literal("error"),
    ),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
    currentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; timestamp: number }> => {
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
    const result: { success: boolean; timestamp: number } =
      await ctx.runMutation(internal.service.agents.upsertHeartbeat, {
        agentId: args.agentId,
        status: args.status,
        currentTaskId: args.currentTaskId,
      });

    return result;
  },
});

/**
 * Update task status on behalf of an agent (service-only).
 * Validates service token, account ownership, and canModifyTaskStatus behavior flag.
 */
export const updateTaskStatusFromAgent = action({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    status: taskStatusValidator,
    blockedReason: v.optional(v.string()),
    expectedStatus: v.optional(taskStatusValidator),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);

    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const allowedStatuses = new Set([
      "in_progress",
      "review",
      "done",
      "blocked",
    ]);
    if (!allowedStatuses.has(args.status)) {
      throw new Error(
        "Invalid status: must be in_progress, review, done, or blocked",
      );
    }

    const agent = await ctx.runQuery(internal.service.agents.getInternal, {
      agentId: args.agentId,
    });
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    if (agent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent belongs to different account");
    }

    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    const flags = resolveBehaviorFlags(agent, account);
    if (!flags.canModifyTaskStatus) {
      throw new Error("Forbidden: Agent is not allowed to modify task status");
    }

    const allowedNextStatuses = new Set<TaskStatus>([
      "in_progress",
      "review",
      "done",
      "blocked",
    ]);

    // Apply the minimum number of valid transitions to reach the target status.
    // This makes tool calls resilient when the agent asks for "done" while the task is still
    // in_progress/assigned (we auto-advance through review).
    const targetStatus = args.status as TaskStatus;
    for (let i = 0; i < 10; i++) {
      const task = await ctx.runQuery(internal.service.tasks.getInternal, {
        taskId: args.taskId,
      });
      if (!task) throw new Error("Not found: Task does not exist");
      if (task.accountId !== args.accountId)
        throw new Error("Forbidden: Task belongs to different account");

      const currentStatus = task.status as TaskStatus;
      if (
        i === 0 &&
        args.expectedStatus &&
        currentStatus !== args.expectedStatus
      )
        return { success: true };
      if (currentStatus === targetStatus) break;

      const path = findStatusPath({
        from: currentStatus,
        to: targetStatus,
        allowedNextStatuses,
      });
      if (!path || path.length === 0) {
        throw new Error(
          `Invalid transition: Cannot move from '${currentStatus}' to '${targetStatus}'`,
        );
      }

      const nextStatus = path[0];
      const isFinalStep = path.length === 1;
      await ctx.runMutation(internal.service.tasks.updateStatusFromAgent, {
        taskId: args.taskId,
        agentId: args.agentId,
        status: nextStatus,
        blockedReason:
          nextStatus === "blocked" ? args.blockedReason : undefined,
        suppressNotifications: !isFinalStep,
        suppressActivity: !isFinalStep,
      });
    }

    return { success: true };
  },
});

/**
 * Create a task on behalf of an agent (service-only).
 * Gated by canCreateTasks behavior flag.
 */
export const createTaskFromAgent = action({
  args: {
    agentId: v.id("agents"),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
    status: v.optional(taskStatusValidator),
    blockedReason: v.optional(v.string()),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ taskId: Id<"tasks"> }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const agent = await ctx.runQuery(internal.service.agents.getInternal, {
      agentId: args.agentId,
    });
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    if (agent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent belongs to different account");
    }

    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    const flags = resolveBehaviorFlags(agent, account);
    if (!flags.canCreateTasks) {
      throw new Error("Forbidden: Agent is not allowed to create tasks");
    }

    const taskId = await ctx.runMutation(
      internal.service.tasks.createFromAgent,
      {
        agentId: args.agentId,
        title: args.title,
        description: args.description,
        priority: args.priority,
        labels: args.labels,
        dueDate: args.dueDate,
        status: args.status,
        blockedReason: args.blockedReason,
      },
    );

    return { taskId };
  },
});

/**
 * Create or update a document on behalf of an agent (service-only).
 * Gated by canCreateDocuments behavior flag.
 */
export const createDocumentFromAgent = action({
  args: {
    agentId: v.id("agents"),
    documentId: v.optional(v.id("documents")),
    taskId: v.optional(v.id("tasks")),
    title: v.string(),
    content: v.string(),
    type: documentTypeValidator,
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ documentId: Id<"documents"> }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const agent = await ctx.runQuery(internal.service.agents.getInternal, {
      agentId: args.agentId,
    });
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    if (agent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent belongs to different account");
    }

    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    const flags = resolveBehaviorFlags(agent, account);
    if (!flags.canCreateDocuments) {
      throw new Error("Forbidden: Agent is not allowed to create documents");
    }

    if (args.taskId) {
      const task = await ctx.runQuery(internal.service.tasks.getInternal, {
        taskId: args.taskId,
      });
      if (!task || task.accountId !== args.accountId) {
        throw new Error(
          "Not found: Task does not exist or belongs to different account",
        );
      }
    }

    const documentId = await ctx.runMutation(
      internal.service.documents.createOrUpdateFromAgent,
      {
        agentId: args.agentId,
        documentId: args.documentId,
        taskId: args.taskId,
        title: args.title,
        content: args.content,
        type: args.type,
      },
    );

    return { documentId };
  },
});

/**
 * Create a message from an agent.
 * Called by runtime when agent posts to a thread (e.g. after OpenClaw response write-back).
 * Optional sourceNotificationId enables idempotent delivery (no duplicate messages on retry).
 * Gated by canMentionAgents for agent mention resolution.
 */
export const createMessageFromAgent = action({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    content: v.string(),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          name: v.string(),
          type: v.string(),
          size: v.number(),
          url: v.optional(v.string()),
        }),
      ),
    ),
    sourceNotificationId: v.optional(v.id("notifications")),
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

    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    const flags = resolveBehaviorFlags(agent, account);
    const allowAgentMentions = flags.canMentionAgents;

    const messageId: Id<"messages"> = await ctx.runMutation(
      internal.service.messages.createFromAgent,
      {
        agentId: args.agentId,
        taskId: args.taskId,
        content: args.content,
        attachments: args.attachments,
        sourceNotificationId: args.sourceNotificationId,
        allowAgentMentions,
      },
    );

    return { messageId };
  },
});

/**
 * Register an uploaded file for an agent so attachments are scoped to the account.
 */
export const registerMessageUploadFromAgent = action({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    storageId: v.id("_storage"),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ uploadId: Id<"messageUploads"> }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const agent = await ctx.runQuery(internal.service.agents.getInternal, {
      agentId: args.agentId,
    });
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    if (agent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent belongs to different account");
    }

    const task = await ctx.runQuery(internal.service.agents.getTaskInternal, {
      taskId: args.taskId,
    });
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    if (task.accountId !== args.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    const uploadId: Id<"messageUploads"> = await ctx.runMutation(
      internal.service.messages.registerUploadFromAgent,
      {
        agentId: args.agentId,
        taskId: args.taskId,
        storageId: args.storageId,
      },
    );

    return { uploadId };
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
      v.literal("rolled_back"),
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
