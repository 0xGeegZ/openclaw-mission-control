import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireAccountMember } from "./lib/auth";
import { taskStatusValidator } from "./lib/validators";
import {
  isValidTransition,
  validateStatusRequirements,
  TaskStatus,
  TASK_STATUS,
  TASK_STATUS_ORDER,
  isPauseAllowedStatus,
} from "./lib/task_workflow";
import { logActivity } from "./lib/activity";
import { ACTIVITY_TYPE, AGENT_STATUS } from "./lib/constants";
import {
  createAssignmentNotification,
  createStatusChangeNotification,
} from "./lib/notifications";
import { ensureSubscribed, ensureOrchestratorSubscribed } from "./subscriptions";
import { notFoundError, forbiddenError, validationError } from "./lib/errors";
import {
  cascadeDeleteTask,
  validateTaskReferences,
  validateAgentBelongsToAccount,
} from "./lib/reference_validation";

const ORCHESTRATOR_CHAT_LABEL = "system:orchestrator-chat";

/**
 * Check whether a task is the account's orchestrator chat thread.
 */
function isOrchestratorChatTask(params: {
  account: Doc<"accounts"> | null;
  task: Doc<"tasks">;
}): boolean {
  const { account, task } = params;
  if (task.labels?.includes(ORCHESTRATOR_CHAT_LABEL)) return true;
  const settings = account?.settings as
    | { orchestratorChatTaskId?: Id<"tasks"> }
    | undefined;
  return settings?.orchestratorChatTaskId === task._id;
}

/**
 * Internal: list tasks for an account (for standup/cron). No auth.
 */
export const listForStandup = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

/**
 * List tasks for an account.
 * Supports filtering by status and sorting.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    status: v.optional(taskStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    const account = await ctx.db.get(args.accountId);

    let tasksQuery = ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId));

    const tasks = await tasksQuery.collect();

    // Filter by status if provided
    let filteredTasks = args.status
      ? tasks.filter((t) => t.status === args.status)
      : tasks;
    filteredTasks = filteredTasks.filter(
      (task) => !isOrchestratorChatTask({ account, task }),
    );

    // Sort by priority (lower = higher priority) then by createdAt
    filteredTasks.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.createdAt - a.createdAt;
    });

    // Apply limit
    if (args.limit) {
      filteredTasks = filteredTasks.slice(0, args.limit);
    }

    return filteredTasks;
  },
});

/**
 * List tasks grouped by status (for Kanban board).
 * Returns tasks organized into columns.
 */
export const listByStatus = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    const account = await ctx.db.get(args.accountId);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    // Group by status
    const grouped: Record<TaskStatus, typeof tasks> = {
      inbox: [],
      assigned: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: [],
      archived: [],
    };

    for (const task of tasks) {
      if (isOrchestratorChatTask({ account, task })) {
        continue;
      }
      grouped[task.status].push(task);
    }

    // Sort each group by priority then createdAt
    for (const status of TASK_STATUS_ORDER) {
      grouped[status].sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.createdAt - a.createdAt;
      });
    }

    return {
      columns: TASK_STATUS_ORDER,
      tasks: grouped,
    };
  },
});

/**
 * Get a single task by ID.
 */
export const get = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return null;
    }

    await requireAccountMember(ctx, task.accountId);
    return task;
  },
});

/**
 * Get or create the account-level orchestrator chat task.
 * Ensures the caller and orchestrator are subscribed to the thread.
 */
export const getOrCreateOrchestratorChat = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAccountMember(ctx, args.accountId);
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw notFoundError("Account does not exist", { accountId: args.accountId });
    }

    const existingTaskId = (
      account.settings as { orchestratorChatTaskId?: Id<"tasks"> } | undefined
    )?.orchestratorChatTaskId;
    const existingTask =
      existingTaskId != null ? await ctx.db.get(existingTaskId) : null;

    if (existingTask && existingTask.accountId === args.accountId) {
      if (!existingTask.labels?.includes(ORCHESTRATOR_CHAT_LABEL)) {
        await ctx.db.patch(existingTask._id, {
          labels: [...(existingTask.labels ?? []), ORCHESTRATOR_CHAT_LABEL],
        });
      }
      await ensureSubscribed(
        ctx,
        args.accountId,
        existingTask._id,
        "user",
        userId,
      );
      await ensureOrchestratorSubscribed(ctx, args.accountId, existingTask._id);
      return existingTask._id;
    }

    const now = Date.now();
    const taskId = await ctx.db.insert("tasks", {
      accountId: args.accountId,
      title: "Orchestrator Chat",
      description: "System thread for orchestrator coordination.",
      status: TASK_STATUS.INBOX,
      priority: 3,
      assignedUserIds: [],
      assignedAgentIds: [],
      labels: ["system:orchestrator-chat"],
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    const currentSettings =
      (account.settings as Record<string, unknown> | undefined) ?? {};
    await ctx.db.patch(args.accountId, {
      settings: {
        ...currentSettings,
        orchestratorChatTaskId: taskId,
      },
    });

    await ensureSubscribed(ctx, args.accountId, taskId, "user", userId);
    await ensureOrchestratorSubscribed(ctx, args.accountId, taskId);

    return taskId;
  },
});

/**
 * Get tasks assigned to a specific agent.
 */
export const listByAgent = query({
  args: {
    accountId: v.id("accounts"),
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    return tasks.filter((t) => t.assignedAgentIds.includes(args.agentId));
  },
});

/**
 * Create a new task.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountMember(
      ctx,
      args.accountId,
    );

    const now = Date.now();

    const taskId = await ctx.db.insert("tasks", {
      accountId: args.accountId,
      title: args.title,
      description: args.description,
      status: TASK_STATUS.INBOX,
      priority: args.priority ?? 3, // Default medium priority
      assignedUserIds: [],
      assignedAgentIds: [],
      labels: args.labels ?? [],
      dueDate: args.dueDate,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Log activity
    await logActivity({
      ctx,
      accountId: args.accountId,
      type: ACTIVITY_TYPE.TASK_CREATED,
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: taskId,
      targetName: args.title,
    });

    await ensureOrchestratorSubscribed(ctx, args.accountId, taskId);

    return taskId;
  },
});

/**
 * Update task details (not status).
 */
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw notFoundError("Task does not exist", { taskId: args.taskId });
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );
    const account = await ctx.db.get(task.accountId);
    if (isOrchestratorChatTask({ account, task })) {
      throw forbiddenError("Orchestrator chat cannot be paused", { taskId: args.taskId });
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.labels !== undefined) updates.labels = args.labels;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;

    await ctx.db.patch(args.taskId, updates);

    // Log activity
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: ACTIVITY_TYPE.TASK_UPDATED,
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: args.title ?? task.title,
      meta: { updates: Object.keys(updates).filter((k) => k !== "updatedAt") },
    });

    return args.taskId;
  },
});

/**
 * Update task status with workflow validation.
 */
export const updateStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: taskStatusValidator,
    blockedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw notFoundError("Task does not exist", { taskId: args.taskId });
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    const currentStatus = task.status;
    const nextStatus = args.status;

    // Validate transition
    if (!isValidTransition(currentStatus, nextStatus)) {
      throw validationError(
        `Cannot move task from '${currentStatus}' to '${nextStatus}'`,
        { currentStatus, nextStatus, taskId: args.taskId },
      );
    }

    // Validate requirements
    const hasAssignees =
      task.assignedUserIds.length > 0 || task.assignedAgentIds.length > 0;
    const requirementError = validateStatusRequirements(
      nextStatus,
      hasAssignees,
      args.blockedReason,
    );

    if (requirementError) {
      throw validationError(requirementError, {
        taskId: args.taskId,
        requestedStatus: nextStatus,
        details: requirementError,
      });
    }

    // Build updates
    const updates: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: Date.now(),
    };

    // Set or clear blocked reason
    if (nextStatus === TASK_STATUS.BLOCKED) {
      updates.blockedReason = args.blockedReason;
    } else if (currentStatus === TASK_STATUS.BLOCKED) {
      updates.blockedReason = undefined;
    }

    // Set archivedAt when transitioning to archived (audit trail)
    if (nextStatus === TASK_STATUS.ARCHIVED) {
      updates.archivedAt = Date.now();
    }

    await ctx.db.patch(args.taskId, updates);

    for (const uid of task.assignedUserIds) {
      await createStatusChangeNotification(
        ctx,
        task.accountId,
        args.taskId,
        "user",
        uid,
        userName,
        task.title,
        nextStatus,
      );
    }
    for (const agentId of task.assignedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (agent) {
        await createStatusChangeNotification(
          ctx,
          task.accountId,
          args.taskId,
          "agent",
          agentId,
          userName,
          task.title,
          nextStatus,
        );
      }
    }

    await logActivity({
      ctx,
      accountId: task.accountId,
      type: ACTIVITY_TYPE.TASK_STATUS_CHANGED,
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: {
        oldStatus: currentStatus,
        newStatus: nextStatus,
        blockedReason: args.blockedReason,
      },
    });

    return args.taskId;
  },
});

const PAUSED_BLOCKED_REASON = "Paused by user (/stop)";

/**
 * Pause all agents on the task (emergency stop). Sets task to blocked and assigned agents to idle.
 * Callable from slash command /stop in the message input.
 *
 * @returns { paused: true } on success, or { paused: true, alreadyBlocked: true } when task was already blocked.
 * @throws When task not found, user not account member, or status not in [assigned, in_progress, review].
 */
export const pauseAgentsOnTask = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw notFoundError("Task does not exist", { taskId: args.taskId });
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    const currentStatus = task.status;

    if (currentStatus === TASK_STATUS.BLOCKED) {
      return { paused: true, alreadyBlocked: true };
    }

    if (!isPauseAllowedStatus(currentStatus)) {
      throw validationError(
        "Task can only be paused when status is Assigned, In progress, or Review",
        { taskId: args.taskId, currentStatus },
      );
    }

    const hasAssignees =
      task.assignedUserIds.length > 0 || task.assignedAgentIds.length > 0;
    const requirementError = validateStatusRequirements(
      TASK_STATUS.BLOCKED,
      hasAssignees,
      PAUSED_BLOCKED_REASON,
    );
    if (requirementError) {
      throw validationError(requirementError, {
        taskId: args.taskId,
        operation: "pause",
        details: requirementError,
      });
    }

    await ctx.db.patch(args.taskId, {
      status: TASK_STATUS.BLOCKED,
      blockedReason: PAUSED_BLOCKED_REASON,
      updatedAt: Date.now(),
    });

    const now = Date.now();
    for (const agentId of task.assignedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (!agent) continue;

      const oldStatus = agent.status;
      await ctx.db.patch(agentId, {
        status: AGENT_STATUS.IDLE,
        currentTaskId: undefined,
        lastHeartbeat: now,
      });

      await logActivity({
        ctx,
        accountId: task.accountId,
        type: ACTIVITY_TYPE.AGENT_STATUS_CHANGED,
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "agent",
        targetId: agentId,
        targetName: agent.name,
        meta: { oldStatus, newStatus: AGENT_STATUS.IDLE, reason: "pause_task" },
      });
    }

    for (const uid of task.assignedUserIds) {
      await createStatusChangeNotification(
        ctx,
        task.accountId,
        args.taskId,
        "user",
        uid,
        userName,
        task.title,
        TASK_STATUS.BLOCKED,
      );
    }
    for (const agentId of task.assignedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (agent) {
        await createStatusChangeNotification(
          ctx,
          task.accountId,
          args.taskId,
          "agent",
          agentId,
          userName,
          task.title,
          TASK_STATUS.BLOCKED,
        );
      }
    }

    await logActivity({
      ctx,
      accountId: task.accountId,
      type: ACTIVITY_TYPE.TASK_STATUS_CHANGED,
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: {
        oldStatus: currentStatus,
        newStatus: TASK_STATUS.BLOCKED,
        blockedReason: PAUSED_BLOCKED_REASON,
      },
    });

    return { paused: true };
  },
});

/**
 * Assign users and/or agents to a task.
 * Newly assigned entities are auto-subscribed to the thread.
 * Auto-transitions between inbox and assigned based on assignees.
 */
export const assign = mutation({
  args: {
    taskId: v.id("tasks"),
    assignedUserIds: v.optional(v.array(v.string())),
    assignedAgentIds: v.optional(v.array(v.id("agents"))),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw notFoundError("Task does not exist", { taskId: args.taskId });
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    const nextAssignedUserIds =
      args.assignedUserIds !== undefined
        ? args.assignedUserIds
        : task.assignedUserIds;
    const nextAssignedAgentIds =
      args.assignedAgentIds !== undefined
        ? args.assignedAgentIds
        : task.assignedAgentIds;

    if (args.assignedUserIds !== undefined) {
      updates.assignedUserIds = nextAssignedUserIds;
    }

    if (args.assignedAgentIds !== undefined) {
      // Phase 3 Enhancement: Validate agents exist and belong to account
      for (const agentId of nextAssignedAgentIds) {
        await validateAgentBelongsToAccount(ctx.db, task.accountId, agentId);
      }
      updates.assignedAgentIds = nextAssignedAgentIds;
    }

    const hasAssignees =
      nextAssignedUserIds.length > 0 || nextAssignedAgentIds.length > 0;
    const shouldAssign = task.status === TASK_STATUS.INBOX && hasAssignees;
    const shouldUnassign = task.status === TASK_STATUS.ASSIGNED && !hasAssignees;
    const nextStatus: TaskStatus | null = shouldAssign
      ? TASK_STATUS.ASSIGNED
      : shouldUnassign
        ? TASK_STATUS.INBOX
        : null;

    if (nextStatus && nextStatus !== task.status) {
      updates.status = nextStatus;
    }

    await ctx.db.patch(args.taskId, updates);

    const previousUserIds = new Set(task.assignedUserIds);
    const previousAgentIds = new Set(task.assignedAgentIds);
    const newUserIds =
      args.assignedUserIds !== undefined
        ? nextAssignedUserIds.filter((uid) => !previousUserIds.has(uid))
        : [];
    const newAgentIds =
      args.assignedAgentIds !== undefined
        ? nextAssignedAgentIds.filter((aid) => !previousAgentIds.has(aid))
        : [];

    for (const uid of newUserIds) {
      await createAssignmentNotification(
        ctx,
        task.accountId,
        args.taskId,
        "user",
        uid,
        userName,
        task.title,
      );
      await ensureSubscribed(ctx, task.accountId, args.taskId, "user", uid);
    }
    for (const agentId of newAgentIds) {
      await createAssignmentNotification(
        ctx,
        task.accountId,
        args.taskId,
        "agent",
        agentId,
        userName,
        task.title,
      );
      await ensureSubscribed(
        ctx,
        task.accountId,
        args.taskId,
        "agent",
        agentId,
      );
    }

    await ensureOrchestratorSubscribed(ctx, task.accountId, args.taskId);

    if (
      nextStatus &&
      nextStatus !== task.status &&
      hasAssignees &&
      !shouldAssign
    ) {
      for (const uid of nextAssignedUserIds) {
        await createStatusChangeNotification(
          ctx,
          task.accountId,
          args.taskId,
          "user",
          uid,
          userName,
          task.title,
          nextStatus,
        );
      }
      for (const agentId of nextAssignedAgentIds) {
        const agent = await ctx.db.get(agentId);
        if (agent) {
          await createStatusChangeNotification(
            ctx,
            task.accountId,
            args.taskId,
            "agent",
            agentId,
            userName,
            task.title,
            nextStatus,
          );
        }
      }
    }

    await logActivity({
      ctx,
      accountId: task.accountId,
      type: ACTIVITY_TYPE.TASK_UPDATED,
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: {
        assignedUserIds: args.assignedUserIds,
        assignedAgentIds: args.assignedAgentIds,
      },
    });

    if (nextStatus && nextStatus !== task.status) {
      await logActivity({
        ctx,
        accountId: task.accountId,
        type: ACTIVITY_TYPE.TASK_STATUS_CHANGED,
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "task",
        targetId: args.taskId,
        targetName: task.title,
        meta: {
          oldStatus: task.status,
          newStatus: nextStatus,
          reason: "auto_assignment",
        },
      });
    }

    return args.taskId;
  },
});

/**
 * Delete a task.
 * Phase 3 Enhancement: Comprehensively deletes task and all associated data:
 * - Messages (with uploads)
 * - Subscriptions
 * - Notifications
 * - Associated activities
 *
 * Uses cascadeDeleteTask helper for maintainable cleanup.
 */
export const remove = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw notFoundError("Task does not exist", { taskId: args.taskId });
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    // Use cascadeDeleteTask helper for comprehensive deletion
    await cascadeDeleteTask(ctx.db, ctx.db, args.taskId);

    // Note: Activities for task deletion are intentionally not logged
    // since the task itself is deleted. Could implement separate audit log if needed.

    return true;
  },
});

/**
 * Reopen a done task (move back to review).
 * Special case since "done" has no outgoing transitions.
 */
export const reopen = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw notFoundError("Task does not exist", { taskId: args.taskId });
    }

    if (task.status !== TASK_STATUS.DONE) {
      throw validationError(
        "Can only reopen tasks with done status",
        { taskId: args.taskId, currentStatus: task.status },
      );
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    await ctx.db.patch(args.taskId, {
      status: TASK_STATUS.REVIEW,
      updatedAt: Date.now(),
    });

    // Log activity
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: ACTIVITY_TYPE.TASK_STATUS_CHANGED,
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: {
        oldStatus: TASK_STATUS.DONE,
        newStatus: TASK_STATUS.REVIEW,
        reopened: true,
      },
    });

    return args.taskId;
  },
});
