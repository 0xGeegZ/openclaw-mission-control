import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { 
  requireAuth, 
  requireAccountMember, 
  requireAccountAdmin,
  requireAccountOwner 
} from "./lib/auth";
import { memberRoleValidator } from "./lib/validators";
import { Id } from "./_generated/dataModel";

/**
 * Get membership by account and user (internal query).
 * No auth required - for use in service actions.
 */
export const getByAccountUser = internalQuery({
  args: {
    accountId: v.id("accounts"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) => 
        q.eq("accountId", args.accountId).eq("userId", args.userId)
      )
      .unique();
  },
});

/**
 * List all members of an account.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    return ctx.db
      .query("memberships")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

/**
 * Get current user's membership for an account.
 */
export const getMyMembership = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const authContext = await requireAuth(ctx);
    
    return ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) => 
        q.eq("accountId", args.accountId).eq("userId", authContext.userId)
      )
      .unique();
  },
});

/**
 * Invite a user to an account.
 * Requires admin role.
 * 
 * Note: In a full implementation, this would send an email invitation.
 * For now, it directly creates the membership (assumes user exists in Clerk).
 */
export const invite = mutation({
  args: {
    accountId: v.id("accounts"),
    userId: v.string(),
    userName: v.string(),
    userEmail: v.string(),
    userAvatarUrl: v.optional(v.string()),
    role: memberRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    
    // Check if user is already a member
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) => 
        q.eq("accountId", args.accountId).eq("userId", args.userId)
      )
      .unique();
    
    if (existing) {
      throw new Error("Conflict: User is already a member");
    }
    
    // Cannot invite as owner (only one owner per account)
    if (args.role === "owner") {
      throw new Error("Forbidden: Cannot invite as owner");
    }
    
    const membershipId = await ctx.db.insert("memberships", {
      accountId: args.accountId,
      userId: args.userId,
      userName: args.userName,
      userEmail: args.userEmail,
      userAvatarUrl: args.userAvatarUrl,
      role: args.role,
      joinedAt: Date.now(),
    });
    
    // TODO: Log activity
    
    return membershipId;
  },
});

/**
 * Update a member's role.
 * Requires admin role.
 * Cannot change owner's role.
 */
export const updateRole = mutation({
  args: {
    accountId: v.id("accounts"),
    membershipId: v.id("memberships"),
    role: memberRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new Error("Not found: Membership does not exist");
    }
    
    if (membership.accountId !== args.accountId) {
      throw new Error("Forbidden: Membership belongs to different account");
    }
    
    // Cannot change owner's role
    if (membership.role === "owner") {
      throw new Error("Forbidden: Cannot change owner's role");
    }
    
    // Cannot promote to owner
    if (args.role === "owner") {
      throw new Error("Forbidden: Cannot promote to owner");
    }
    
    await ctx.db.patch(args.membershipId, { role: args.role });
    
    // TODO: Log activity
    
    return args.membershipId;
  },
});

/**
 * Remove a member from an account.
 * Requires admin role.
 * Cannot remove owner.
 */
export const remove = mutation({
  args: {
    accountId: v.id("accounts"),
    membershipId: v.id("memberships"),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw new Error("Not found: Membership does not exist");
    }
    
    if (membership.accountId !== args.accountId) {
      throw new Error("Forbidden: Membership belongs to different account");
    }
    
    // Cannot remove owner
    if (membership.role === "owner") {
      throw new Error("Forbidden: Cannot remove owner");
    }
    
    await ctx.db.delete(args.membershipId);
    
    // TODO: Log activity
    
    return true;
  },
});

/**
 * Leave an account.
 * User can leave any account they're a member of.
 * Owner cannot leave (must transfer ownership first).
 */
export const leave = mutation({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireAccountMember(ctx, args.accountId);
    
    // Owner cannot leave
    if (membership.role === "owner") {
      throw new Error("Forbidden: Owner cannot leave account. Transfer ownership first.");
    }
    
    await ctx.db.delete(membership._id);
    
    // TODO: Log activity
    
    return true;
  },
});

/**
 * Transfer ownership to another member.
 * Requires current owner role.
 */
export const transferOwnership = mutation({
  args: {
    accountId: v.id("accounts"),
    newOwnerMembershipId: v.id("memberships"),
  },
  handler: async (ctx, args) => {
    const { membership: currentOwnerMembership } = await requireAccountOwner(ctx, args.accountId);
    
    const newOwnerMembership = await ctx.db.get(args.newOwnerMembershipId);
    if (!newOwnerMembership) {
      throw new Error("Not found: Target membership does not exist");
    }
    
    if (newOwnerMembership.accountId !== args.accountId) {
      throw new Error("Forbidden: Target membership belongs to different account");
    }
    
    // Swap roles
    await ctx.db.patch(currentOwnerMembership._id, { role: "admin" });
    await ctx.db.patch(args.newOwnerMembershipId, { role: "owner" });
    
    // TODO: Log activity
    
    return true;
  },
});
