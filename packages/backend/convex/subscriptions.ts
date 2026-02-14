import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
} from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { recipientTypeValidator } from "./lib/validators";
import { Id } from "./_generated/dataModel";
import type { RecipientType } from "@packages/shared";

/**
 * Get subscriptions for a task.
 */
export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return [];
    }

    await requireAccountMember(ctx, task.accountId);

    return ctx.db
      .query("subscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

/**
 * Check if entity is subscribed to a task.
 */
export const isSubscribed = query({
  args: {
    taskId: v.id("tasks"),
    subscriberType: recipientTypeValidator,
    subscriberId: v.string(),
  },
  handler: async (ctx, args) => {
    // Load task and verify ownership
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return false;
    }

    await requireAccountMember(ctx, task.accountId);

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_task_subscriber", (q) =>
        q
          .eq("taskId", args.taskId)
          .eq("subscriberType", args.subscriberType)
          .eq("subscriberId", args.subscriberId),
      )
      .unique();

    return subscription !== null;
  },
});

/**
 * Subscribe to a task thread.
 */
export const subscribe = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    const { userId } = await requireAccountMember(ctx, task.accountId);

    // Check if already subscribed
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_task_subscriber", (q) =>
        q
          .eq("taskId", args.taskId)
          .eq("subscriberType", "user")
          .eq("subscriberId", userId),
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    return ctx.db.insert("subscriptions", {
      accountId: task.accountId,
      taskId: args.taskId,
      subscriberType: "user",
      subscriberId: userId,
      subscribedAt: Date.now(),
    });
  },
});

/**
 * Unsubscribe from a task thread.
 */
export const unsubscribe = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }

    const { userId } = await requireAccountMember(ctx, task.accountId);

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_task_subscriber", (q) =>
        q
          .eq("taskId", args.taskId)
          .eq("subscriberType", "user")
          .eq("subscriberId", userId),
      )
      .unique();

    if (subscription) {
      await ctx.db.delete(subscription._id);
    }

    return true;
  },
});

/**
 * Internal: Auto-subscribe an entity to a task.
 * Used when posting messages or being mentioned.
 */
export const autoSubscribe = internalMutation({
  args: {
    accountId: v.id("accounts"),
    taskId: v.id("tasks"),
    subscriberType: recipientTypeValidator,
    subscriberId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if already subscribed
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_task_subscriber", (q) =>
        q
          .eq("taskId", args.taskId)
          .eq("subscriberType", args.subscriberType)
          .eq("subscriberId", args.subscriberId),
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    return ctx.db.insert("subscriptions", {
      accountId: args.accountId,
      taskId: args.taskId,
      subscriberType: args.subscriberType,
      subscriberId: args.subscriberId,
      subscribedAt: Date.now(),
    });
  },
});

/**
 * Helper: Ensure entity is subscribed (for use in mutations).
 */
export async function ensureSubscribed(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
  subscriberType: RecipientType,
  subscriberId: string,
): Promise<void> {
  const existing = await ctx.db
    .query("subscriptions")
    .withIndex("by_task_subscriber", (q) =>
      q
        .eq("taskId", taskId)
        .eq("subscriberType", subscriberType)
        .eq("subscriberId", subscriberId),
    )
    .unique();

  if (!existing) {
    await ctx.db.insert("subscriptions", {
      accountId,
      taskId,
      subscriberType,
      subscriberId,
      subscribedAt: Date.now(),
    });
  }
}

/**
 * Ensure the account's orchestrator (squad lead) is subscribed to the task thread.
 * No-op if orchestratorAgentId is not set or agent does not belong to the account.
 */
export async function ensureOrchestratorSubscribed(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  taskId: Id<"tasks">,
): Promise<void> {
  const account = await ctx.db.get(accountId);
  if (!account) return;

  const orchestratorAgentId = (
    account.settings as { orchestratorAgentId?: Id<"agents"> } | undefined
  )?.orchestratorAgentId;
  if (!orchestratorAgentId) return;

  const agent = await ctx.db.get(orchestratorAgentId);
  if (!agent || agent.accountId !== accountId) return;

  await ensureSubscribed(ctx, accountId, taskId, "agent", orchestratorAgentId);
}
