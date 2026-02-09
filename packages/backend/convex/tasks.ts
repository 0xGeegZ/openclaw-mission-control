import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireAccountMember } from "./lib/auth";
import { taskStatusValidator } from "./lib/validators";
import {
  isValidTransition,
  validateStatusRequirements,
  TaskStatus,
  TASK_STATUS_ORDER,
  PAUSE_ALLOWED_STATUSES,
} from "./lib/task_workflow";
import { logActivity } from "./lib/activity";
import {
  createAssignmentNotification,
  createStatusChangeNotification,
} from "./lib/notifications";
import { ensureSubscribed, ensureOrchestratorSubscribed } from "./subscriptions";
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
    };

    for (const task of tasks) {
      if (isOrchestratorChatTask({ account, task })) {
        continue;
      }
      grouped[task.status as TaskStatus].push(task);
    }

    // Sort each group by priority then createdAt
    for (const status of Object.keys(grouped) as TaskStatus[]) {
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
      throw new Error("Not found: Account does not exist");
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
      status: "inbox",
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
      status: "inbox",
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
      type: "task_created",
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
      throw new Error("Not found: Task does not exist");
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );
    const account = await ctx.db.get(task.accountId);
    if (isOrchestratorChatTask({ account, task })) {
      throw new Error("Orchestrator chat cannot be paused");
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
      type: "task_updated",
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
      throw new Error("Not found: Task does not exist");
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    const currentStatus = task.status as TaskStatus;
    const nextStatus = args.status as TaskStatus;

    // Validate transition
    if (!isValidTransition(currentStatus, nextStatus)) {
      throw new Error(
        `Invalid transition: Cannot move from '${currentStatus}' to '${nextStatus}'`,
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
      throw new Error(`Invalid status change: ${requirementError}`);
    }

    // Build updates
    const updates: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: Date.now(),
    };

    // Set or clear blocked reason
    if (nextStatus === "blocked") {
      updates.blockedReason = args.blockedReason;
    } else if (currentStatus === "blocked") {
      updates.blockedReason = undefined;
    }

    const changedAt = Date.now();
    const updatesWithTimestamp = {
      ...updates,
      updatedAt: changedAt,
    };

    await ctx.db.patch(args.taskId, updatesWithTimestamp);

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
      type: "task_status_changed",
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

    // Return enhanced response: previousStatus, newStatus, changedAt
    // Enables QA to verify status changes without additional polling
    return {
      taskId: args.taskId,
      previousStatus: currentStatus,
      newStatus: nextStatus,
      changedAt,
    };
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
      throw new Error("Not found: Task does not exist");
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    const currentStatus = task.status as TaskStatus;

    if (currentStatus === "blocked") {
      return { paused: true, alreadyBlocked: true };
    }

    if (!PAUSE_ALLOWED_STATUSES.includes(currentStatus)) {
      throw new Error(
        "Task can only be paused when status is Assigned, In progress, or Review",
      );
    }

    const hasAssignees =
      task.assignedUserIds.length > 0 || task.assignedAgentIds.length > 0;
    const requirementError = validateStatusRequirements(
      "blocked",
      hasAssignees,
      PAUSED_BLOCKED_REASON,
    );
    if (requirementError) {
      throw new Error(`Invalid status change: ${requirementError}`);
    }

    await ctx.db.patch(args.taskId, {
      status: "blocked",
      blockedReason: PAUSED_BLOCKED_REASON,
      updatedAt: Date.now(),
    });

    const now = Date.now();
    for (const agentId of task.assignedAgentIds) {
      const agent = await ctx.db.get(agentId);
      if (!agent) continue;

      const oldStatus = agent.status;
      await ctx.db.patch(agentId, {
        status: "idle",
        currentTaskId: undefined,
        lastHeartbeat: now,
      });

      await logActivity({
        ctx,
        accountId: task.accountId,
        type: "agent_status_changed",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "agent",
        targetId: agentId,
        targetName: agent.name,
        meta: { oldStatus, newStatus: "idle", reason: "pause_task" },
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
        "blocked",
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
          "blocked",
        );
      }
    }

    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_status_changed",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: {
        oldStatus: currentStatus,
        newStatus: "blocked",
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
      throw new Error("Not found: Task does not exist");
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
    const shouldAssign = task.status === "inbox" && hasAssignees;
    const shouldUnassign = task.status === "assigned" && !hasAssignees;
    const nextStatus: TaskStatus | null = shouldAssign
      ? "assigned"
      : shouldUnassign
        ? "inbox"
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
      type: "task_updated",
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
        type: "task_status_changed",
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
      throw new Error("Not found: Task does not exist");
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
      throw new Error("Not found: Task does not exist");
    }

    if (task.status !== "done") {
      throw new Error("Invalid operation: Can only reopen done tasks");
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      task.accountId,
    );

    await ctx.db.patch(args.taskId, {
      status: "review",
      updatedAt: Date.now(),
    });

    // Log activity
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_status_changed",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: { oldStatus: "done", newStatus: "review", reopened: true },
    });

    return args.taskId;
  },
});
