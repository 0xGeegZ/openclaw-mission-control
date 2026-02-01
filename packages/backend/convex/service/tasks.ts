import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

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
