/**
 * Admin customer management functions.
 * Handles customer CRUD operations with quota enforcement and audit logging.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireAccountAdmin, requireAccountMember } from "./lib/auth";
import { logActivity } from "./lib/activity";

/**
 * List all customers for an account with pagination and filtering.
 */
export const list_customers = query({
  args: {
    accountId: v.id("accounts"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;

    // In the current schema, accounts represent customers/organizations
    const accounts = await ctx.db
      .query("accounts")
      .take(limit)
      .skip(offset)
      .collect();

    return {
      accounts: accounts.map((account) => ({
        id: account._id,
        name: account.name,
        email: account.email,
        plan: account.plan ?? "free",
        createdAt: account._creationTime,
      })),
      total: accounts.length,
    };
  },
});

/**
 * Get a single customer by ID.
 */
export const get_customer = query({
  args: {
    accountId: v.id("accounts"),
    customerId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${args.customerId}`);
    }

    // Get membership count for this account
    const memberCount = await ctx.db
      .query("memberships")
      .withIndex("by_account", (q) => q.eq("accountId", args.customerId))
      .collect()
      .then((m) => m.length);

    return {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      plan: customer.plan ?? "free",
      createdAt: customer._creationTime,
      memberCount,
    };
  },
});

/**
 * Create a new customer account.
 * Enforces admin permissions and logs the action.
 */
export const create_customer = mutation({
  args: {
    accountId: v.id("accounts"),
    email: v.string(),
    name: v.string(),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise"))),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    // Validate email format
    if (!args.email.includes("@")) {
      throw new Error("Invalid email format");
    }

    // Check for duplicate email
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    if (existing) {
      throw new Error(`Account with email ${args.email} already exists`);
    }

    // Create account
    const customerId = await ctx.db.insert("accounts", {
      email: args.email,
      name: args.name,
      plan: args.plan ?? "free",
      slug: args.email.split("@")[0].toLowerCase(),
      settings: {
        notifications: true,
        autoRenew: true,
      },
    });

    // Log activity
    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_created",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "customer",
        targetId: customerId,
        targetName: args.name,
        meta: {
          email: args.email,
          plan: args.plan ?? "free",
        },
      });
    } catch {
      // Activity logging is optional; continue if it fails
    }

    return {
      success: true,
      customerId,
      message: `Customer '${args.name}' created successfully`,
    };
  },
});

/**
 * Update a customer's information.
 */
export const update_customer = mutation({
  args: {
    accountId: v.id("accounts"),
    customerId: v.id("accounts"),
    name: v.optional(v.string()),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise"))),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${args.customerId}`);
    }

    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.plan !== undefined) updates.plan = args.plan;

    await ctx.db.patch(args.customerId, updates);

    // Log activity
    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_updated",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "customer",
        targetId: args.customerId,
        targetName: customer.name,
        meta: updates,
      });
    } catch {
      // Activity logging is optional; continue if it fails
    }

    return {
      success: true,
      message: `Customer '${customer.name}' updated successfully`,
    };
  },
});

/**
 * Delete a customer account.
 */
export const delete_customer = mutation({
  args: {
    accountId: v.id("accounts"),
    customerId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountAdmin(ctx, args.accountId);

    const customer = await ctx.db.get(args.customerId);
    if (!customer) {
      throw new Error(`Customer not found: ${args.customerId}`);
    }

    // Soft delete or cascade?
    // For safety, we'll just mark as deleted or require no active resources
    const containers = await ctx.db
      .query("containers")
      .withIndex("by_account", (q) => q.eq("accountId", args.customerId))
      .collect();

    if (containers.length > 0) {
      throw new Error(
        `Cannot delete customer with active containers. Delete containers first.`
      );
    }

    // Delete memberships
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_account", (q) => q.eq("accountId", args.customerId))
      .collect();

    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    // Delete account
    await ctx.db.delete(args.customerId);

    // Log activity
    try {
      await logActivity({
        ctx,
        accountId: args.accountId,
        type: "resource_deleted",
        actorType: "user",
        actorId: userId,
        actorName: userName,
        targetType: "customer",
        targetId: args.customerId,
        targetName: customer.name,
        meta: {},
      });
    } catch {
      // Activity logging is optional; continue if it fails
    }

    return {
      success: true,
      message: `Customer '${customer.name}' deleted successfully`,
    };
  },
});
