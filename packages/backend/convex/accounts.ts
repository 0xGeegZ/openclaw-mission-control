import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { requireAuth, requireAccountMember, requireAccountAdmin, requireAccountOwner } from "./lib/auth";

/**
 * Create a new account.
 * The creating user becomes the owner.
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const authContext = await requireAuth(ctx);
    
    // Check slug uniqueness
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    
    if (existing) {
      throw new Error("Conflict: Account slug already exists");
    }
    
    // Create account
    const accountId = await ctx.db.insert("accounts", {
      name: args.name,
      slug: args.slug,
      plan: "free",
      runtimeStatus: "offline",
      createdAt: Date.now(),
    });
    
    // Create owner membership
    await ctx.db.insert("memberships", {
      accountId,
      userId: authContext.userId,
      userName: authContext.userName,
      userEmail: authContext.userEmail,
      userAvatarUrl: authContext.userAvatarUrl,
      role: "owner",
      joinedAt: Date.now(),
    });
    
    // TODO: Log activity (implemented in Module 08)
    
    return accountId;
  },
});

/**
 * Get account by ID.
 * Requires membership.
 */
export const get = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { account } = await requireAccountMember(ctx, args.accountId);
    return account;
  },
});

/**
 * Get account by ID (internal query).
 * No auth required - for use in service actions.
 */
export const getInternal = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  },
});

/**
 * Get account by slug.
 * Requires membership.
 */
export const getBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const authContext = await requireAuth(ctx);
    
    const account = await ctx.db
      .query("accounts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    
    if (!account) {
      return null;
    }
    
    // Check membership
    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) => 
        q.eq("accountId", account._id).eq("userId", authContext.userId)
      )
      .unique();
    
    if (!membership) {
      return null;
    }
    
    return account;
  },
});

/**
 * List all accounts the current user is a member of.
 */
export const listMyAccounts = query({
  args: {},
  handler: async (ctx) => {
    const authContext = await requireAuth(ctx);
    
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", authContext.userId))
      .collect();
    
    const accounts = await Promise.all(
      memberships.map(async (m) => {
        const account = await ctx.db.get(m.accountId);
        return account ? { ...account, role: m.role } : null;
      })
    );
    
    return accounts.filter(Boolean);
  },
});

const accountSettingsValidator = v.object({
  theme: v.optional(v.string()),
  notificationPreferences: v.optional(v.object({
    taskUpdates: v.boolean(),
    agentActivity: v.boolean(),
    emailDigest: v.boolean(),
  })),
});

/**
 * Update account details (name, slug, settings).
 * Requires admin role. Slug must be unique if changed.
 */
export const update = mutation({
  args: {
    accountId: v.id("accounts"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    settings: v.optional(accountSettingsValidator),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Not found: Account does not exist");
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) {
      updates.name = args.name;
    }
    if (args.slug !== undefined) {
      if (args.slug !== account.slug) {
        const existing = await ctx.db
          .query("accounts")
          .withIndex("by_slug", (q) => q.eq("slug", args.slug!))
          .unique();
        if (existing) {
          throw new Error("Conflict: Account slug already exists");
        }
        updates.slug = args.slug;
      }
    }
    if (args.settings !== undefined) {
      const current = (account as { settings?: { theme?: string; notificationPreferences?: { taskUpdates?: boolean; agentActivity?: boolean; emailDigest?: boolean } } }).settings ?? {};
      updates.settings = {
        ...current,
        ...(args.settings.theme !== undefined && { theme: args.settings.theme }),
        ...(args.settings.notificationPreferences !== undefined && {
          notificationPreferences: {
            ...(current.notificationPreferences ?? {}),
            ...args.settings.notificationPreferences,
          },
        }),
      };
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.accountId, updates);
    }

    return args.accountId;
  },
});

/**
 * Update account runtime status (internal mutation).
 * Called by service actions with validated service tokens.
 * 
 * Includes version tracking for OpenClaw and runtime service.
 */
export const updateRuntimeStatusInternal = internalMutation({
  args: {
    accountId: v.id("accounts"),
    status: v.union(
      v.literal("provisioning"),
      v.literal("online"),
      v.literal("degraded"),
      v.literal("offline"),
      v.literal("error")
    ),
    config: v.optional(v.object({
      dropletId: v.string(),
      ipAddress: v.string(),
      region: v.optional(v.string()),
      lastHealthCheck: v.optional(v.number()),
      // Version tracking (v1)
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
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      runtimeStatus: args.status,
    };
    
    if (args.config) {
      updates.runtimeConfig = args.config;
    }
    
    await ctx.db.patch(args.accountId, updates);
    
    // TODO: Log activity
    
    return args.accountId;
  },
});

/**
 * Update service token hash (internal mutation).
 * Called by service actions when provisioning tokens.
 */
export const updateServiceTokenHash = internalMutation({
  args: {
    accountId: v.id("accounts"),
    serviceTokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      serviceTokenHash: args.serviceTokenHash,
    });
    
    return args.accountId;
  },
});

/**
 * Delete account.
 * Requires owner role.
 * WARNING: This deletes all account data.
 */
export const remove = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountOwner(ctx, args.accountId);
    
    // Delete all related data
    // Order matters for foreign key-like relationships
    
    // 1. Delete notifications
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_account_created", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const n of notifications) {
      await ctx.db.delete(n._id);
    }

    // 2. Delete subscriptions for all account tasks (subscriptions reference taskId)
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const task of tasks) {
      const subs = await ctx.db
        .query("subscriptions")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      for (const s of subs) {
        await ctx.db.delete(s._id);
      }
    }

    // 3. Delete activities
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const a of activities) {
      await ctx.db.delete(a._id);
    }
    
    // 4. Delete messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const m of messages) {
      await ctx.db.delete(m._id);
    }
    
    // 5. Delete documents
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const d of documents) {
      await ctx.db.delete(d._id);
    }

    // 6. Delete tasks (subscriptions already deleted above)
    for (const t of tasks) {
      await ctx.db.delete(t._id);
    }
    
    // 7. Delete agents
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const a of agents) {
      await ctx.db.delete(a._id);
    }
    
    // 8. Delete memberships
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    for (const m of memberships) {
      await ctx.db.delete(m._id);
    }
    
    // 9. Delete account
    await ctx.db.delete(args.accountId);
    
    return true;
  },
});
