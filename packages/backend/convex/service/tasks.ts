import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { taskStatusValidator } from "../lib/validators";
import {
  isValidTransition,
  validateStatusRequirements,
  TaskStatus,
} from "../lib/task_workflow";
import { logActivity } from "../lib/activity";
import { createStatusChangeNotification } from "../lib/notifications";

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
 * Update a task status on behalf of an agent (service-only).
 * Enforces workflow rules and logs activity.
 * Optionally guard against unexpected current status changes.
 */
export const updateStatusFromAgent = internalMutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    status: taskStatusValidator,
    blockedReason: v.optional(v.string()),
    expectedStatus: v.optional(taskStatusValidator),
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

    const currentStatus = task.status as TaskStatus;
    const nextStatus = args.status as TaskStatus;
    const expectedStatus = args.expectedStatus as TaskStatus | undefined;

    if (expectedStatus && currentStatus !== expectedStatus) {
      return args.taskId;
    }

    if (currentStatus === nextStatus) {
      return args.taskId;
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

    const updates: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: Date.now(),
    };

    if (nextStatus === "blocked") {
      updates.blockedReason = args.blockedReason;
    } else if (currentStatus === "blocked") {
      updates.blockedReason = undefined;
    }

    await ctx.db.patch(args.taskId, updates);

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

    return args.taskId;
  },
});
