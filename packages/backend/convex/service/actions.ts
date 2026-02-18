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
import {
  TASK_STATUS,
  TASK_STATUS_TRANSITIONS,
  type TaskStatus,
} from "../lib/task_workflow";
import type { RecipientType } from "@packages/shared";

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
 * Mark delivery as ended for a notification (typing stops; notification stays undelivered for retry).
 * Called by runtime when delivery fails so the typing indicator stops immediately.
 * On next attempt, markNotificationRead clears deliveryEndedAt so typing can show again.
 */
export const markNotificationDeliveryEnded = action({
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
    await ctx.runMutation(internal.service.notifications.markDeliveryEnded, {
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
  handler: async (ctx, args): Promise<unknown[]> => {
    // Validate service token and verify account matches
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);

    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const [agents, account] = await Promise.all([
      ctx.runQuery(internal.service.agents.listInternal, {
        accountId: args.accountId,
      }),
      ctx.runQuery(internal.accounts.getInternal, {
        accountId: args.accountId,
      }),
    ]);

    return agents.map((agent) => ({
      ...agent,
      effectiveBehaviorFlags: resolveBehaviorFlags(agent, account),
    }));
  },
});

/**
 * Get orchestrator agent id for an account (service-only).
 */
export const getOrchestratorAgentId = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ orchestratorAgentId: Id<"agents"> | null }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;

    return { orchestratorAgentId };
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
  effectiveUserMd: string;
  effectiveIdentityContent: string;
  resolvedSkills: Array<{
    _id: Id<"skills">;
    name: string;
    slug: string;
    description: string | undefined;
    contentMarkdown?: string;
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
 * List tasks assigned to a specific agent (service-only).
 */
export const listAssignedTasksForAgent = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    agentId: v.id("agents"),
    includeDone: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"tasks">[]> => {
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

    return await ctx.runQuery(internal.service.tasks.listAssignedForAgent, {
      accountId: args.accountId,
      agentId: args.agentId,
      includeDone: args.includeDone,
      limit: args.limit,
    });
  },
});

/**
 * List account tasks for orchestrator heartbeat (service-only).
 */
export const listTasksForOrchestratorHeartbeat = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    statuses: v.array(taskStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"tasks">[]> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    if (args.statuses.length === 0) {
      return [];
    }

    return await ctx.runQuery(internal.service.tasks.listByStatusForAccount, {
      accountId: args.accountId,
      statuses: args.statuses,
      limit: args.limit,
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
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: true;
    taskId: Id<"tasks">;
    requestedStatus: TaskStatus;
    status: TaskStatus;
    updatedAt: number;
    changed: boolean;
  }> => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);

    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const allowedStatuses = new Set<TaskStatus>([
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.REVIEW,
      TASK_STATUS.DONE,
      TASK_STATUS.BLOCKED,
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
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.REVIEW,
      TASK_STATUS.DONE,
      TASK_STATUS.BLOCKED,
    ]);

    let changed = false;
    let finalStatus: TaskStatus | null = null;
    let finalUpdatedAt: number | null = null;

    // Apply the minimum number of valid transitions to reach the target status.
    // This makes tool calls resilient when the agent asks for "done" while the task is still
    // in_progress/assigned (we auto-advance through review).
    const targetStatus = args.status;
    for (let i = 0; i < 10; i++) {
      const task = await ctx.runQuery(internal.service.tasks.getInternal, {
        taskId: args.taskId,
      });
      if (!task) throw new Error("Not found: Task does not exist");
      if (task.accountId !== args.accountId)
        throw new Error("Forbidden: Task belongs to different account");

      const currentStatus = task.status;
      if (
        i === 0 &&
        args.expectedStatus &&
        currentStatus !== args.expectedStatus
      ) {
        finalStatus = currentStatus;
        finalUpdatedAt = task.updatedAt;
        break;
      }
      if (
        i === 0 &&
        targetStatus === TASK_STATUS.DONE &&
        currentStatus !== TASK_STATUS.REVIEW &&
        currentStatus !== TASK_STATUS.DONE
      ) {
        throw new Error(
          "Forbidden: Task must be in review before marking done",
        );
      }
      if (currentStatus === targetStatus) {
        finalStatus = currentStatus;
        finalUpdatedAt = task.updatedAt;
        break;
      }

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
          nextStatus === TASK_STATUS.BLOCKED ? args.blockedReason : undefined,
        suppressNotifications: !isFinalStep,
        suppressActivity: !isFinalStep,
      });
      changed = true;
    }

    if (!finalStatus || finalUpdatedAt == null) {
      const task = await ctx.runQuery(internal.service.tasks.getInternal, {
        taskId: args.taskId,
      });
      if (!task) throw new Error("Not found: Task does not exist");
      if (task.accountId !== args.accountId)
        throw new Error("Forbidden: Task belongs to different account");
      finalStatus = task.status;
      finalUpdatedAt = task.updatedAt;
    }

    return {
      success: true,
      taskId: args.taskId,
      requestedStatus: targetStatus,
      status: finalStatus,
      updatedAt: finalUpdatedAt,
      changed,
    };
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
    assignedAgentIds: v.optional(v.array(v.id("agents"))),
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
        assignedAgentIds: args.assignedAgentIds,
      },
    );

    return { taskId };
  },
});

/**
 * Assign agents to a task on behalf of the orchestrator (service-only).
 */
export const assignTaskFromAgent = action({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    assignedAgentIds: v.array(v.id("agents")),
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
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error("Forbidden: Only the orchestrator can assign agents");
    }

    const taskId = await ctx.runMutation(
      internal.service.tasks.assignFromAgent,
      {
        taskId: args.taskId,
        agentId: args.agentId,
        assignedAgentIds: args.assignedAgentIds,
      },
    );

    return { taskId };
  },
});

/**
 * Update task fields on behalf of an agent (service-only).
 * Unified tool for updating title, description, priority, labels, assignees, status, dueDate.
 * Gated by canModifyTaskStatus behavior flag.
 */
export const updateTaskFromAgent = action({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    assignedAgentIds: v.optional(v.array(v.id("agents"))),
    assignedUserIds: v.optional(v.array(v.string())),
    status: v.optional(taskStatusValidator),
    blockedReason: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    taskId: Id<"tasks">;
    changedFields: string[];
  }> => {
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
    if (!flags.canModifyTaskStatus) {
      throw new Error("Forbidden: Agent is not allowed to modify tasks");
    }

    const task = await ctx.runQuery(internal.service.tasks.getInternal, {
      taskId: args.taskId,
    });
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    if (task.accountId !== args.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    // Validate at least one field is being updated
    const hasUpdates =
      args.title !== undefined ||
      args.description !== undefined ||
      args.priority !== undefined ||
      args.labels !== undefined ||
      args.assignedAgentIds !== undefined ||
      args.assignedUserIds !== undefined ||
      args.status !== undefined ||
      args.dueDate !== undefined;

    if (!hasUpdates) {
      return { taskId: args.taskId, changedFields: [] };
    }

    // Validate priority range (schema: 1 = highest, 5 = lowest)
    if (
      args.priority !== undefined &&
      (args.priority < 1 || args.priority > 5)
    ) {
      throw new Error(
        "Invalid priority: must be between 1 (highest) and 5 (lowest)",
      );
    }

    // Validate status and blockedReason
    const allowedStatuses = new Set<TaskStatus>([
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.REVIEW,
      TASK_STATUS.DONE,
      TASK_STATUS.BLOCKED,
    ]);
    if (args.status && !allowedStatuses.has(args.status)) {
      throw new Error(
        "Invalid status: must be in_progress, review, done, or blocked",
      );
    }
    if (args.status === TASK_STATUS.BLOCKED && !args.blockedReason?.trim()) {
      throw new Error("blockedReason is required when status is 'blocked'");
    }

    const changedFields: string[] = [];
    const updates: Record<string, unknown> = {};

    if (args.title !== undefined) {
      updates.title = args.title.trim();
      changedFields.push("title");
    }

    if (args.description !== undefined) {
      updates.description = args.description.trim();
      changedFields.push("description");
    }

    if (args.priority !== undefined) {
      updates.priority = args.priority;
      changedFields.push("priority");
    }

    if (args.labels !== undefined) {
      updates.labels = args.labels;
      changedFields.push("labels");
    }

    if (args.assignedAgentIds !== undefined) {
      updates.assignedAgentIds = args.assignedAgentIds;
      changedFields.push("assignedAgentIds");
    }

    if (args.assignedUserIds !== undefined) {
      updates.assignedUserIds = args.assignedUserIds;
      changedFields.push("assignedUserIds");
    }

    if (args.dueDate !== undefined) {
      updates.dueDate = args.dueDate;
      changedFields.push("dueDate");
    }

    const hasNonStatusUpdates = Object.keys(updates).length > 0;
    const hasAssigneeUpdates =
      args.assignedAgentIds !== undefined || args.assignedUserIds !== undefined;
    const applyUpdatesBeforeStatus =
      hasNonStatusUpdates &&
      hasAssigneeUpdates &&
      args.status === TASK_STATUS.IN_PROGRESS &&
      task.status !== TASK_STATUS.IN_PROGRESS;

    if (applyUpdatesBeforeStatus) {
      updates.updatedAt = Date.now();
      await ctx.runMutation(internal.service.tasks.updateFromAgent, {
        taskId: args.taskId,
        agentId: args.agentId,
        updates,
      });
    }

    // If status is being changed, handle status transitions
    if (args.status && args.status !== task.status) {
      const allowedNextStatuses = new Set<TaskStatus>([
        TASK_STATUS.IN_PROGRESS,
        TASK_STATUS.REVIEW,
        TASK_STATUS.DONE,
        TASK_STATUS.BLOCKED,
      ]);

      const targetStatus = args.status;
      const currentStatus = task.status;

      // Validate task must be in review before marking done
      if (
        targetStatus === TASK_STATUS.DONE &&
        currentStatus !== TASK_STATUS.REVIEW &&
        currentStatus !== TASK_STATUS.DONE
      ) {
        throw new Error(
          "Forbidden: Task must be in review before marking done",
        );
      }

      // Apply status change through transitions
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

      for (let i = 0; i < path.length; i++) {
        const nextStatus = path[i];
        const isFinalStep = i === path.length - 1;
        await ctx.runMutation(internal.service.tasks.updateStatusFromAgent, {
          taskId: args.taskId,
          agentId: args.agentId,
          status: nextStatus,
          blockedReason:
            nextStatus === TASK_STATUS.BLOCKED ? args.blockedReason : undefined,
          suppressNotifications: !isFinalStep,
          suppressActivity: !isFinalStep,
        });
      }
      changedFields.push("status");
    }

    // Only patch if there are non-status updates
    if (hasNonStatusUpdates && !applyUpdatesBeforeStatus) {
      updates.updatedAt = Date.now();
      await ctx.runMutation(internal.service.tasks.updateFromAgent, {
        taskId: args.taskId,
        agentId: args.agentId,
        updates,
      });
    }

    return {
      taskId: args.taskId,
      changedFields,
    };
  },
});

/**
 * List tasks for orchestrator tools (service-only).
 */
export const listTasksForAgentTool = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    agentId: v.id("agents"),
    status: v.optional(taskStatusValidator),
    assigneeAgentId: v.optional(v.id("agents")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Doc<"tasks">[]> => {
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
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error("Forbidden: Only the orchestrator can list tasks");
    }

    return await ctx.runQuery(internal.service.tasks.listForTool, {
      accountId: args.accountId,
      status: args.status,
      assigneeAgentId: args.assigneeAgentId,
      limit: args.limit,
    });
  },
});

/**
 * Get a task for orchestrator tools (service-only).
 */
export const getTaskForAgentTool = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args): Promise<Doc<"tasks"> | null> => {
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
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error("Forbidden: Only the orchestrator can get tasks");
    }

    return await ctx.runQuery(internal.service.tasks.getForTool, {
      accountId: args.accountId,
      taskId: args.taskId,
    });
  },
});

/**
 * List task thread messages for orchestrator tools (service-only).
 * Optional limit (1–200) for history size; underlying query defaults to 50 when omitted.
 */
export const listTaskThreadForAgentTool = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      messageId: Id<"messages">;
      authorType: RecipientType;
      authorId: string;
      authorName: string | null;
      content: string;
      createdAt: number;
    }>
  > => {
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
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error("Forbidden: Only the orchestrator can read threads");
    }

    return await ctx.runQuery(internal.service.messages.listThreadForTool, {
      accountId: args.accountId,
      taskId: args.taskId,
      limit: args.limit,
    });
  },
});

/**
 * Post a task message for orchestrator tools (service-only).
 */
export const createTaskMessageForAgentTool = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    content: v.string(),
  },
  handler: async (ctx, args): Promise<{ messageId: Id<"messages"> }> => {
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
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error(
        "Forbidden: Only the orchestrator can post task messages",
      );
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

    const flags = resolveBehaviorFlags(agent, account);
    const allowAgentMentions = flags.canMentionAgents;

    const messageId: Id<"messages"> = await ctx.runMutation(
      internal.service.messages.createFromAgent,
      {
        agentId: args.agentId,
        taskId: args.taskId,
        content: args.content,
        allowAgentMentions,
      },
    );

    return { messageId };
  },
});

/**
 * Search tasks for orchestrator tools (service-only).
 * Returns matching tasks with relevance scores.
 */
export const searchTasksForAgentTool = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    agentId: v.id("agents"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      _id: Id<"tasks">;
      title: string;
      status: string;
      priority: number;
      blockedReason?: string;
      assignedAgentIds: Id<"agents">[];
      assignedUserIds: string[];
      createdAt: number;
      updatedAt: number;
      relevanceScore: number;
    }>
  > => {
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
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error("Forbidden: Only the orchestrator can search tasks");
    }

    return await ctx.runQuery(internal.service.tasks.searchTasksForAgentTool, {
      accountId: args.accountId,
      agentId: args.agentId,
      query: args.query,
      limit: args.limit,
    });
  },
});

/**
 * Create response_request notifications from an agent (service-only).
 * Used by runtime response_request tool to explicitly ask other agents for replies.
 */
export const createResponseRequestNotifications = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    requesterAgentId: v.id("agents"),
    taskId: v.id("tasks"),
    recipientSlugs: v.array(v.string()),
    message: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ notificationIds: Array<Id<"notifications">> }> => {
    const maxRecipients = 10;
    const maxMessageChars = 1000;
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    const requester = await ctx.runQuery(internal.service.agents.getInternal, {
      agentId: args.requesterAgentId,
    });
    if (!requester) {
      throw new Error("Not found: Agent does not exist");
    }
    if (requester.accountId !== args.accountId) {
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

    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    const flags = resolveBehaviorFlags(requester, account);
    if (!flags.canMentionAgents) {
      throw new Error("Forbidden: Agent may not request responses");
    }

    if (args.recipientSlugs.length > maxRecipients) {
      throw new Error(
        `Too many recipients: max ${maxRecipients} allowed per request`,
      );
    }
    if (!args.message.trim()) {
      throw new Error("Message is required");
    }
    if (args.message.trim().length > maxMessageChars) {
      throw new Error(
        `Message too long: max ${maxMessageChars} characters allowed`,
      );
    }

    const slugMap = new Map(
      args.recipientSlugs.map((slug) => [slug.trim().toLowerCase(), slug]),
    );
    const uniqueSlugs = Array.from(slugMap.keys()).filter((slug) => slug);
    if (uniqueSlugs.length === 0) {
      throw new Error("Invalid recipient slugs: none provided");
    }

    const agents = await ctx.runQuery(internal.service.agents.listInternal, {
      accountId: args.accountId,
    });
    const agentsBySlug = new Map(
      agents
        .filter((agent) => (agent.slug ?? "").trim())
        .map((agent) => [agent.slug.trim().toLowerCase(), agent]),
    );
    const missingSlugs: string[] = [];
    const recipientAgentIds: Array<Id<"agents">> = [];
    for (const slug of uniqueSlugs) {
      const agent = agentsBySlug.get(slug);
      if (!agent) {
        missingSlugs.push(slugMap.get(slug) ?? slug);
        continue;
      }
      if (agent._id === requester._id) continue;
      recipientAgentIds.push(agent._id);
    }

    if (missingSlugs.length > 0) {
      throw new Error(`Unknown recipient slugs: ${missingSlugs.join(", ")}`);
    }
    if (recipientAgentIds.length === 0) {
      throw new Error("No valid recipients after filtering");
    }

    const notificationIds = await ctx.runMutation(
      internal.service.notifications.createResponseRequestNotificationsInternal,
      {
        accountId: args.accountId,
        requesterAgentId: args.requesterAgentId,
        taskId: args.taskId,
        recipientAgentIds,
        message: args.message,
      },
    );

    return { notificationIds };
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
    /** When true, suppress agent notifications for this message (prevents reply loops). */
    suppressAgentNotifications: v.optional(v.boolean()),
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
    /** 0-based part index for multi-message delivery from one notification. */
    sourceNotificationPartIndex: v.optional(v.number()),
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
    const suppressAgentNotifications = args.suppressAgentNotifications === true;

    const messageId: Id<"messages"> = await ctx.runMutation(
      internal.service.messages.createFromAgent,
      {
        agentId: args.agentId,
        taskId: args.taskId,
        content: args.content,
        attachments: args.attachments,
        sourceNotificationId: args.sourceNotificationId,
        sourceNotificationPartIndex: args.sourceNotificationPartIndex,
        allowAgentMentions,
        suppressAgentNotifications,
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

/**
 * Load full task details with thread summary for agents (service-only).
 * Returns task metadata plus recent thread messages in one call.
 */
export const loadTaskDetailsForAgentTool = action({
  args: {
    accountId: v.id("accounts"),
    serviceToken: v.string(),
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    messageLimit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    task: Doc<"tasks">;
    thread: Array<{
      messageId: Id<"messages">;
      authorType: RecipientType;
      authorId: string;
      authorName: string | null;
      content: string;
      createdAt: number;
    }>;
  }> => {
    // Validate service token
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    // Verify agent belongs to this account
    const agent = await ctx.runQuery(internal.service.agents.getInternal, {
      agentId: args.agentId,
    });
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    if (agent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent belongs to different account");
    }

    // Verify task belongs to this account
    const task = await ctx.runQuery(internal.service.tasks.getInternal, {
      taskId: args.taskId,
    });
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    if (task.accountId !== args.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    // Fetch thread messages with validated limit (1-200, default 10)
    const messageLimit =
      args.messageLimit != null
        ? Math.min(Math.max(1, args.messageLimit), 200)
        : 10;
    const thread = await ctx.runQuery(
      internal.service.messages.listThreadForTool,
      {
        accountId: args.accountId,
        taskId: args.taskId,
        limit: messageLimit,
      },
    );

    return { task, thread };
  },
});

/**
 * Delete/archive a task on behalf of an agent (service action).
 * Soft-delete: transitions task to "archived" status with archivedAt timestamp.
 * Orchestrator-only; enforces that agent is the account orchestrator.
 * Messages and documents are preserved for audit trail.
 * Called by the task_delete runtime tool.
 */
export const deleteTaskFromAgent = action({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    reason: v.string(),
    serviceToken: v.string(),
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
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

    // Verify orchestrator status
    const account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId: args.accountId,
    });
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error(
        "Forbidden: Only the orchestrator can archive/delete tasks",
      );
    }

    // Perform soft-delete via internal mutation
    await ctx.runMutation(internal.service.tasks.deleteTaskFromAgent, {
      taskId: args.taskId,
      agentId: args.agentId,
      reason: args.reason,
    });

    return { success: true };
  },
});

/**
 * Link a task to a GitHub PR bidirectionally.
 * Updates task metadata with prNumber and attempts to add task reference to PR description.
 * Logs a warning (does not fail) if the PR head branch name does not contain the task ID (one-branch-per-task convention).
 * Orchestrator-only access.
 */
export const linkTaskToPrForAgentTool = action({
  args: {
    accountId: v.id("accounts"),
    agentId: v.id("agents"),
    serviceToken: v.string(),
    taskId: v.id("tasks"),
    prNumber: v.number(),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
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
    const orchestratorAgentId =
      (account?.settings as { orchestratorAgentId?: Id<"agents"> } | undefined)
        ?.orchestratorAgentId ?? null;
    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error("Forbidden: Only the orchestrator can link tasks to PRs");
    }

    const task = await ctx.runQuery(internal.service.tasks.getInternal, {
      taskId: args.taskId,
    });
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    if (task.accountId !== args.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    // Update task metadata with PR number
    await ctx.runMutation(internal.service.tasks.updateTaskPrMetadata, {
      taskId: args.taskId,
      prNumber: args.prNumber,
    });

    // Attempt to update PR description with task reference via GitHub API
    // Note: This requires GITHUB_TOKEN and GITHUB_REPO in environment; graceful degradation if missing
    const ghToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    if (!ghToken) {
      console.warn("GitHub API call skipped: GITHUB_TOKEN not set");
      return { success: true };
    }
    if (!repo) {
      console.warn("GitHub API call skipped: GITHUB_REPO not set");
      return { success: true };
    }
    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
      console.warn(
        "GitHub API call skipped: GITHUB_REPO must be in 'owner/repo' format",
      );
      return { success: true };
    }
    if (ghToken) {
      try {
        const taskMarker = `<!-- task: ${task._id} -->`;

        // Fetch current PR details
        const prResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/pulls/${args.prNumber}`,
          {
            headers: {
              Authorization: `Bearer ${ghToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        if (!prResponse.ok) {
          console.warn(
            `Failed to fetch PR #${args.prNumber}: ${prResponse.statusText}`,
          );
          return { success: true };
        }

        const pr = (await prResponse.json()) as {
          body?: string;
          head?: { ref?: string };
        };
        const prBranch = pr.head?.ref ?? "";
        if (prBranch && !prBranch.includes(args.taskId)) {
          console.warn(
            `PR #${args.prNumber} branch "${prBranch}" does not match task ${args.taskId}; consider using branch feat/task-${args.taskId}`,
          );
        }
        let currentBody = pr.body || "";

        // Remove old task marker if present
        currentBody = currentBody.replace(/\n*<!-- task: [\w]+ -->/g, "");

        // Append new task marker
        const newBody = currentBody.trim() + "\n\n" + taskMarker;

        // Update PR description
        const updateResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/pulls/${args.prNumber}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${ghToken}`,
              Accept: "application/vnd.github.v3+json",
            },
            body: JSON.stringify({ body: newBody }),
          },
        );

        if (!updateResponse.ok) {
          console.warn(
            `Failed to update PR #${args.prNumber} description: ${updateResponse.statusText}`,
          );
        }
      } catch (err) {
        // Log warning but don't fail the mutation; task side is already updated
        console.warn("Error updating PR description:", err);
      }
    }

    return { success: true };
  },
});

/**
 * Get agent skills for query tool.
 * All agents can query any agent's skills or all agents (not orchestrator-only).
 */
export const getAgentSkillsForTool = action({
  args: {
    accountId: v.id("accounts"),
    agentId: v.id("agents"),
    serviceToken: v.string(),
    queryAgentId: v.optional(v.id("agents")), // Which agent to query; undefined = all agents
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      agentId: string;
      skillIds: string[];
      skillCount: number;
      lastUpdated: string;
    }>
  > => {
    const serviceContext = await requireServiceAuth(ctx, args.serviceToken);
    if (serviceContext.accountId !== args.accountId) {
      throw new Error("Forbidden: Service token does not match account");
    }

    // Verify requesting agent exists and belongs to account
    const requestingAgent = await ctx.runQuery(
      internal.service.agents.getInternal,
      {
        agentId: args.agentId,
      },
    );
    if (!requestingAgent) {
      throw new Error("Not found: Requesting agent does not exist");
    }
    if (requestingAgent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent belongs to different account");
    }

    const toIso = (ts: number) => new Date(ts).toISOString();

    // If queryAgentId specified, return that agent's skills (any agent may query any other)
    if (args.queryAgentId) {
      const targetAgent = await ctx.runQuery(
        internal.service.agents.getInternal,
        {
          agentId: args.queryAgentId,
        },
      );
      if (!targetAgent) {
        throw new Error("Not found: Target agent does not exist");
      }
      if (targetAgent.accountId !== args.accountId) {
        throw new Error("Forbidden: Target agent belongs to different account");
      }

      return [
        {
          agentId: targetAgent.slug || String(targetAgent._id),
          skillIds: targetAgent.openclawConfig?.skillIds || [],
          skillCount: targetAgent.openclawConfig?.skillIds?.length || 0,
          lastUpdated: toIso(
            targetAgent.lastHeartbeat || targetAgent._creationTime,
          ),
        },
      ];
    }

    // No queryAgentId: return all agents' skills
    const allAgents = await ctx.runQuery(internal.service.agents.listInternal, {
      accountId: args.accountId,
    });

    return allAgents.map((agent) => ({
      agentId: agent.slug || String(agent._id),
      skillIds: agent.openclawConfig?.skillIds || [],
      skillCount: agent.openclawConfig?.skillIds?.length || 0,
      lastUpdated: toIso(agent.lastHeartbeat || agent._creationTime),
    }));
  },
});
