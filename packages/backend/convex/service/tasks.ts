import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { taskStatusValidator } from "../lib/validators";
import {
  TASK_STATUS,
  isValidTransition,
  validateStatusRequirements,
  TaskStatus,
} from "../lib/task_workflow";
import { logActivity } from "../lib/activity";
import {
  createAssignmentNotification,
  createStatusChangeNotification,
} from "../lib/notifications";
import {
  ensureSubscribed,
  ensureOrchestratorSubscribed,
} from "../subscriptions";
import {
  DEFAULT_TASK_SEARCH_LIMIT,
  MAX_TASK_SEARCH_LIMIT,
} from "../search";

const QA_ROLE_PATTERN = /\bqa\b|quality assurance|quality\b/i;

/**
 * Returns true when the task status requires at least one assignee.
 */
function requiresAssignee(status: TaskStatus): boolean {
  return status === TASK_STATUS.ASSIGNED || status === TASK_STATUS.IN_PROGRESS;
}

/**
 * Returns true when an agent is considered QA based on role or slug.
 */
function isQaAgent(
  agent: Pick<Doc<"agents">, "role" | "slug"> | null,
): boolean {
  if (!agent) return false;
  const role = (agent.role ?? "").toLowerCase();
  const slug = (agent.slug ?? "").toLowerCase();
  return slug === "qa" || QA_ROLE_PATTERN.test(role);
}

/**
 * Calculate search relevance score for a task with weighted field matching.
 * title (3x) > description (2x) > blockedReason (1x)
 */
export function scoreTaskSearchRelevance(
  task: Pick<Doc<"tasks">, "title" | "description" | "blockedReason">,
  query: string,
): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;
  const titleLower = task.title.toLowerCase();
  const descLower = (task.description ?? "").toLowerCase();
  const blockerLower = (task.blockedReason ?? "").toLowerCase();

  if (titleLower.includes(normalizedQuery)) score += 3;
  if (descLower.includes(normalizedQuery)) score += 2;
  if (blockerLower.includes(normalizedQuery)) score += 1;

  return score;
}

/**
 * Returns true when the account has at least one QA agent configured.
 */
async function hasQaAgent(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
): Promise<boolean> {
  const agents = await ctx.db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  return agents.some((agent) => isQaAgent(agent));
}

/**
 * Service-only task queries for runtime service.
 * Internal queries that can be called from service actions.
 */

/**
 * Get a task by ID (internal, no user auth required).
 */
export const getInternal = internalQuery({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.taskId);
  },
});

/**
 * List tasks assigned to a specific agent (internal, service-only).
 * Uses by_account index to avoid full table scans.
 */
export const listAssignedForAgent = internalQuery({
  args: {
    accountId: v.id("accounts"),
    agentId: v.id("agents"),
    includeDone: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.accountId !== args.accountId) {
      return [];
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const includeDone = args.includeDone === true;
    const assignedTasks = tasks.filter((task) =>
      task.assignedAgentIds.includes(args.agentId),
    );
    const filtered = includeDone
      ? assignedTasks
      : assignedTasks.filter((task) => task.status !== TASK_STATUS.DONE);

    const limit = Math.min(args.limit ?? 50, 200);
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  },
});

/**
 * List tasks for an account filtered by status (internal, service-only).
 * Uses by_account_status index per status and merges results.
 */
export const listByStatusForAccount = internalQuery({
  args: {
    accountId: v.id("accounts"),
    statuses: v.array(taskStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    const uniqueStatuses = Array.from(new Set(args.statuses));
    if (uniqueStatuses.length === 0) {
      return [];
    }

    const perStatusLimit = limit;
    const results = await Promise.all(
      uniqueStatuses.map((status) =>
        ctx.db
          .query("tasks")
          .withIndex("by_account_status", (q) =>
            q.eq("accountId", args.accountId).eq("status", status),
          )
          .order("desc")
          .take(perStatusLimit),
      ),
    );

    const merged = new Map<Id<"tasks">, Doc<"tasks">>();
    for (const task of results.flat()) {
      merged.set(task._id, task);
    }

    return Array.from(merged.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  },
});

const TOOL_ASSIGNEE_SCAN_LIMIT = 200;
const TOOL_TASK_STATUSES: TaskStatus[] = [
  TASK_STATUS.INBOX,
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
  TASK_STATUS.DONE,
  TASK_STATUS.BLOCKED,
  TASK_STATUS.ARCHIVED,
];

/**
 * List tasks for agent tools (internal, service-only).
 * Supports optional status + assignee filtering with capped limits.
 */
export const listForTool = internalQuery({
  args: {
    accountId: v.id("accounts"),
    status: v.optional(taskStatusValidator),
    assigneeAgentId: v.optional(v.id("agents")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    const fetchLimit = Math.min(limit * 10, 200);
    const assigneeAgentId = args.assigneeAgentId;

    if (assigneeAgentId && !args.status) {
      const perStatusLimit = Math.ceil(
        TOOL_ASSIGNEE_SCAN_LIMIT / TOOL_TASK_STATUSES.length,
      );
      const results = await Promise.all(
        TOOL_TASK_STATUSES.map((status) =>
          ctx.db
            .query("tasks")
            .withIndex("by_account_status", (q) =>
              q.eq("accountId", args.accountId).eq("status", status),
            )
            .order("desc")
            .take(perStatusLimit),
        ),
      );
      const merged = new Map<Id<"tasks">, Doc<"tasks">>();
      for (const task of results.flat()) {
        merged.set(task._id, task);
      }
      return Array.from(merged.values())
        .filter((task) => task.assignedAgentIds.includes(assigneeAgentId))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit);
    }

    const baseTasks = args.status
      ? await ctx.db
          .query("tasks")
          .withIndex("by_account_status", (q) =>
            q.eq("accountId", args.accountId).eq("status", args.status!),
          )
          .order("desc")
          .take(fetchLimit)
      : await ctx.db
          .query("tasks")
          .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
          .order("desc")
          .take(fetchLimit);

    const filtered = assigneeAgentId
      ? baseTasks.filter((task) =>
          task.assignedAgentIds.includes(assigneeAgentId),
        )
      : baseTasks;

    return filtered.slice(0, limit);
  },
});

/**
 * Get a task for agent tools (internal, service-only).
 */
export const getForTool = internalQuery({
  args: {
    accountId: v.id("accounts"),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.accountId !== args.accountId) {
      return null;
    }
    return task;
  },
});

/**
 * Create a task on behalf of an agent (service-only).
 * Enforces status requirements; auto-assigns creating agent when status is assigned/in_progress and no assignees.
 */
export const createFromAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    title: v.string(),
    description: v.optional(v.string()),
    priority: v.optional(v.number()),
    labels: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
    status: v.optional(taskStatusValidator),
    blockedReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    const accountId = agent.accountId;
    const now = Date.now();

    const assignedUserIds: string[] = [];
    let assignedAgentIds: Id<"agents">[] = [];
    const requestedStatus = args.status ?? TASK_STATUS.INBOX;
    if (
      (requestedStatus === TASK_STATUS.ASSIGNED ||
        requestedStatus === TASK_STATUS.IN_PROGRESS) &&
      assignedUserIds.length === 0
    ) {
      assignedAgentIds = [args.agentId];
    }
    const hasAssignees =
      assignedUserIds.length > 0 || assignedAgentIds.length > 0;
    const requirementError = validateStatusRequirements(
      requestedStatus,
      hasAssignees,
      args.blockedReason,
    );
    if (requirementError) {
      throw new Error(`Invalid status at creation: ${requirementError}`);
    }

    const taskId = await ctx.db.insert("tasks", {
      accountId,
      title: args.title,
      description: args.description,
      status: requestedStatus,
      priority: args.priority ?? 3,
      assignedUserIds,
      assignedAgentIds,
      labels: args.labels ?? [],
      dueDate: args.dueDate,
      blockedReason:
        requestedStatus === TASK_STATUS.BLOCKED ? args.blockedReason : undefined,
      createdBy: args.agentId,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity({
      ctx,
      accountId,
      type: "task_created",
      actorType: "agent",
      actorId: args.agentId,
      actorName: agent.name,
      targetType: "task",
      targetId: taskId,
      targetName: args.title,
    });

    await ensureOrchestratorSubscribed(ctx, accountId, taskId);
    if (assignedAgentIds.includes(args.agentId)) {
      await ensureSubscribed(ctx, accountId, taskId, "agent", args.agentId);
    }

    return taskId;
  },
});

/**
 * Assign agents to a task on behalf of an agent (service-only).
 * Adds new agent assignees without removing existing ones.
 */
export const assignFromAgent = internalMutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    assignedAgentIds: v.array(v.id("agents")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    if (task.accountId !== agent.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    const nextAssignedAgentIds = Array.from(
      new Set([...task.assignedAgentIds, ...args.assignedAgentIds]),
    );

    for (const agentId of nextAssignedAgentIds) {
      const assignedAgent = await ctx.db.get(agentId);
      if (!assignedAgent || assignedAgent.accountId !== task.accountId) {
        throw new Error(`Invalid agent: ${agentId}`);
      }
    }

    const hasAssignees =
      task.assignedUserIds.length > 0 || nextAssignedAgentIds.length > 0;
    const shouldAssign = task.status === TASK_STATUS.INBOX && hasAssignees;
    const nextStatus: TaskStatus | null =
      shouldAssign && nextAssignedAgentIds.length > 0
        ? TASK_STATUS.IN_PROGRESS
        : shouldAssign
          ? TASK_STATUS.ASSIGNED
          : null;

    const updates: Record<string, unknown> = {
      assignedAgentIds: nextAssignedAgentIds,
      updatedAt: Date.now(),
    };
    if (nextStatus && nextStatus !== task.status) {
      updates.status = nextStatus;
    }

    await ctx.db.patch(args.taskId, updates);

    const previousAgentIds = new Set(task.assignedAgentIds);
    const newAgentIds = nextAssignedAgentIds.filter(
      (aid) => !previousAgentIds.has(aid),
    );

    for (const assignedAgentId of newAgentIds) {
      await createAssignmentNotification(
        ctx,
        task.accountId,
        args.taskId,
        "agent",
        assignedAgentId,
        agent.name,
        task.title,
      );
      await ensureSubscribed(
        ctx,
        task.accountId,
        args.taskId,
        "agent",
        assignedAgentId,
      );
    }

    await ensureOrchestratorSubscribed(ctx, task.accountId, args.taskId);

    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_updated",
      actorType: "agent",
      actorId: args.agentId,
      actorName: agent.name,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: {
        assignedAgentIds: newAgentIds,
      },
    });

    if (nextStatus && nextStatus !== task.status) {
      await logActivity({
        ctx,
        accountId: task.accountId,
        type: "task_status_changed",
        actorType: "agent",
        actorId: args.agentId,
        actorName: agent.name,
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
 * Update a task status on behalf of an agent (service-only).
 * Enforces workflow rules and logs activity.
 * Optionally guard against unexpected current status changes.
 * @returns { taskId, previousStatus, newStatus, changedAt } for all paths (no-change or applied).
 */
export const updateStatusFromAgent = internalMutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    status: taskStatusValidator,
    blockedReason: v.optional(v.string()),
    expectedStatus: v.optional(taskStatusValidator),
    suppressNotifications: v.optional(v.boolean()),
    suppressActivity: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const suppressNotifications = args.suppressNotifications === true;
    const suppressActivity = args.suppressActivity === true;
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    if (task.accountId !== agent.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    const currentStatus = task.status;
    const nextStatus = args.status;
    const expectedStatus = args.expectedStatus;

    const noChangeResponse = (): {
      taskId: Id<"tasks">;
      previousStatus: TaskStatus;
      newStatus: TaskStatus;
      changedAt: number;
    } => ({
      taskId: args.taskId,
      previousStatus: currentStatus,
      newStatus: currentStatus,
      changedAt: task.updatedAt,
    });

    if (expectedStatus && currentStatus !== expectedStatus) {
      return noChangeResponse();
    }

    if (currentStatus === nextStatus) {
      return noChangeResponse();
    }

    if (nextStatus === TASK_STATUS.DONE) {
      const hasQaReviewer = await hasQaAgent(ctx, task.accountId);
      if (hasQaReviewer && !isQaAgent(agent)) {
        throw new Error("Forbidden: QA must approve and mark tasks as done");
      }

      if (!hasQaReviewer) {
        const account = await ctx.db.get(task.accountId);
        const orchestratorAgentId = (
          account?.settings as
            | {
                orchestratorAgentId?: Id<"agents">;
              }
            | undefined
        )?.orchestratorAgentId;

        if (!orchestratorAgentId) {
          throw new Error(
            "Forbidden: Orchestrator must be set to mark tasks as done",
          );
        }

        if (orchestratorAgentId !== args.agentId) {
          throw new Error(
            "Forbidden: Only the orchestrator can mark tasks as done",
          );
        }
      }
    }

    if (!isValidTransition(currentStatus, nextStatus)) {
      throw new Error(
        `Invalid transition: Cannot move from '${currentStatus}' to '${nextStatus}'`,
      );
    }

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

    const changedAt = Date.now();
    const updates: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: changedAt,
    };

    if (nextStatus === TASK_STATUS.BLOCKED) {
      updates.blockedReason = args.blockedReason;
    } else if (currentStatus === TASK_STATUS.BLOCKED) {
      updates.blockedReason = undefined;
    }

    await ctx.db.patch(args.taskId, updates);

    if (!suppressNotifications) {
      for (const uid of task.assignedUserIds) {
        await createStatusChangeNotification(
          ctx,
          task.accountId,
          args.taskId,
          "user",
          uid,
          agent.name,
          task.title,
          nextStatus,
        );
      }

      for (const assignedAgentId of task.assignedAgentIds) {
        if (assignedAgentId === args.agentId) continue;
        const assignedAgent = await ctx.db.get(assignedAgentId);
        if (assignedAgent) {
          await createStatusChangeNotification(
            ctx,
            task.accountId,
            args.taskId,
            "agent",
            assignedAgentId,
            agent.name,
            task.title,
            nextStatus,
          );
        }
      }
    }

    if (!suppressActivity) {
      await logActivity({
        ctx,
        accountId: task.accountId,
        type: "task_status_changed",
        actorType: "agent",
        actorId: args.agentId,
        actorName: agent.name,
        targetType: "task",
        targetId: args.taskId,
        targetName: task.title,
        meta: {
          oldStatus: currentStatus,
          newStatus: nextStatus,
          blockedReason: args.blockedReason,
        },
      });
    }

    return {
      taskId: args.taskId,
      previousStatus: currentStatus,
      newStatus: nextStatus,
      changedAt,
    };
  },
});

/**
 * Update task fields on behalf of an agent (service-only).
 * Handles title, description, priority, labels, assignedAgentIds, assignedUserIds, dueDate.
 * Status changes should be handled separately via updateStatusFromAgent.
 */
export const updateFromAgent = internalMutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    updates: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    if (task.accountId !== agent.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    // Whitelist allowed fields to prevent unauthorized updates
    const allowedFields = new Set([
      "title",
      "description",
      "priority",
      "labels",
      "assignedAgentIds",
      "assignedUserIds",
      "dueDate",
      "updatedAt",
    ]);

    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args.updates)) {
      if (allowedFields.has(key)) {
        safeUpdates[key] = value;
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return args.taskId;
    }

    // Validate assignedAgentIds references if provided
    if (safeUpdates.assignedAgentIds && Array.isArray(safeUpdates.assignedAgentIds)) {
      for (const agentId of safeUpdates.assignedAgentIds) {
        const assignedAgent = await ctx.db.get(agentId as Id<"agents">);
        if (!assignedAgent || assignedAgent.accountId !== task.accountId) {
          throw new Error(`Invalid agent: ${agentId}`);
        }
      }
    }

    // assignedUserIds are Clerk user IDs (strings); ensure array of non-empty strings
    if (safeUpdates.assignedUserIds !== undefined) {
      if (!Array.isArray(safeUpdates.assignedUserIds)) {
        throw new Error("assignedUserIds must be an array");
      }
      const valid = safeUpdates.assignedUserIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      );
      for (const userId of valid) {
        const membership = await ctx.db
          .query("memberships")
          .withIndex("by_account_user", (q) =>
            q.eq("accountId", task.accountId).eq("userId", userId)
          )
          .unique();
        if (!membership) {
          throw new Error(`Invalid user: ${userId} is not a member of this account`);
        }
      }
      safeUpdates.assignedUserIds = valid;
    }

    const nextAssignedUserIds =
      safeUpdates.assignedUserIds !== undefined
        ? (safeUpdates.assignedUserIds as string[])
        : task.assignedUserIds;
    const nextAssignedAgentIds =
      safeUpdates.assignedAgentIds !== undefined
        ? (safeUpdates.assignedAgentIds as Id<"agents">[])
        : task.assignedAgentIds;
    const nextHasAssignees =
      nextAssignedUserIds.length > 0 || nextAssignedAgentIds.length > 0;
    if (requiresAssignee(task.status) && !nextHasAssignees) {
      throw new Error(
        `Invalid assignees: status '${task.status}' requires at least one assignee`,
      );
    }

    await ctx.db.patch(args.taskId, safeUpdates);

    // Log activity
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_updated",
      actorType: "agent",
      actorId: args.agentId,
      actorName: agent.name,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: {
        changedFields: Object.keys(safeUpdates).filter(
          (k) => k !== "updatedAt"
        ),
      },
    });

    return args.taskId;
  },
});

/**
 * Search tasks for an account on behalf of an agent (service-only).
 * Returns tasks matching the query with relevance scores.
 */
export const searchTasksForAgentTool = internalQuery({
  args: {
    accountId: v.id("accounts"),
    agentId: v.id("agents"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify agent belongs to account (for auth; agentId is not used for filtering)
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.accountId !== args.accountId) {
      throw new Error("Forbidden: Agent does not belong to this account");
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .collect();

    const q = args.query.trim().toLowerCase();
    const limit = Math.min(
      args.limit ?? DEFAULT_TASK_SEARCH_LIMIT,
      MAX_TASK_SEARCH_LIMIT,
    );

    if (!q) {
      return [];
    }

    // Score and filter all tasks
    const scored = tasks
      .map((task) => ({
        task,
        score: scoreTaskSearchRelevance(task, q),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => ({
        _id: item.task._id,
        title: item.task.title,
        status: item.task.status,
        priority: item.task.priority,
        blockedReason: item.task.blockedReason,
        assignedAgentIds: item.task.assignedAgentIds,
        assignedUserIds: item.task.assignedUserIds,
        createdAt: item.task.createdAt,
        updatedAt: item.task.updatedAt,
        relevanceScore: item.score,
      }));

    return scored;
  },
});

/**
 * Update task PR metadata (internal, service-only).
 * Used by task_link_pr tool to store GitHub PR link.
 */
export const updateTaskPrMetadata = internalMutation({
  args: {
    taskId: v.id("tasks"),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    await ctx.db.patch(args.taskId, {
      metadata: {
        ...(task.metadata ?? {}),
        prNumber: args.prNumber,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete/archive a task on behalf of an agent (service-only).
 * Soft-delete: transitions task to "archived" status with archivedAt timestamp.
 * Orchestrator-only; messages and documents are preserved for audit trail.
 * Logs activity for accountability.
 */
export const deleteTaskFromAgent = internalMutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    if (task.accountId !== agent.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }

    // Check if agent is orchestrator (admin-only operation)
    const account = await ctx.db.get(task.accountId);
    const orchestratorAgentId = (
      account?.settings as
        | {
            orchestratorAgentId?: Id<"agents">;
          }
        | undefined
    )?.orchestratorAgentId;

    if (!orchestratorAgentId || orchestratorAgentId !== args.agentId) {
      throw new Error(
        "Forbidden: Only the orchestrator can archive/delete tasks",
      );
    }

    const now = Date.now();

    // Soft-delete: transition to "archived" status
    await ctx.db.patch(args.taskId, {
      status: TASK_STATUS.ARCHIVED,
      archivedAt: now,
      updatedAt: now,
    });

    // Log activity for audit trail
    await logActivity({
      ctx,
      accountId: task.accountId,
      type: "task_status_changed",
      actorType: "agent",
      actorId: args.agentId,
      actorName: agent.name,
      targetType: "task",
      targetId: args.taskId,
      targetName: task.title,
      meta: {
        oldStatus: task.status,
        newStatus: TASK_STATUS.ARCHIVED,
        reason: args.reason,
        action: "task_deleted",
      },
    });

    return args.taskId;
  },
});
