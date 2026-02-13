import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import {
  requireAuth,
  requireAccountMember,
  requireAccountAdmin,
  requireAccountOwner,
} from "./lib/auth";
import { memberRoleValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";
import {
  createMemberAddedNotification,
  createMemberRemovedNotification,
  createRoleChangeNotification,
} from "./lib/notifications";
import { notFoundError, forbiddenError } from "./lib/errors";
import { Id } from "./_generated/dataModel";
import {
  assertMatches,
  assertAuthorized,
  assertDefined,
  assertEqual,
  conflictError,
  forbiddenError,
} from "./lib/validation";
import { ErrorCode } from "./lib/errors";

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
    const { userId: inviterId, userName: inviterName } = await requireAccountAdmin(ctx, args.accountId);

    // Check if user is already a member
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) => 
        q.eq("accountId", args.accountId).eq("userId", args.userId)
      )
      .unique();
    
    assertMatches(
      !existing,
      "User is already a member of this account",
      ErrorCode.CONFLICT
    );
    
    // Cannot invite as owner (only one owner per account)
    assertAuthorized(
      args.role !== "owner",
      "Cannot invite user as owner (only one owner per account)"
    );
    
    const membershipId = await ctx.db.insert("memberships", {
      accountId: args.accountId,
      userId: args.userId,
      userName: args.userName,
      userEmail: args.userEmail,
      userAvatarUrl: args.userAvatarUrl,
      role: args.role,
      joinedAt: Date.now(),
    });

    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "member_added",
      actorType: "user",
      actorId: inviterId,
      actorName: inviterName,
      targetType: "membership",
      targetId: membershipId,
      targetName: args.userName,
      meta: { role: args.role },
    });

    const account = await ctx.db.get(args.accountId);
    if (account) {
      await createMemberAddedNotification(
        ctx,
        args.accountId,
        args.userId,
        account.name,
        inviterName
      );
    }

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
    const { userId: updaterId, userName: updaterName, account } = await requireAccountAdmin(ctx, args.accountId);

    const membership = await ctx.db.get(args.membershipId);
    assertDefined(membership, "Membership does not exist");
    
    assertEqual(
      membership.accountId,
      args.accountId,
      "Membership belongs to a different account"
    );
    
    // Cannot change owner's role
    assertAuthorized(
      membership.role !== "owner",
      "Cannot change the owner's role"
    );
    
    // Cannot promote to owner
    assertAuthorized(
      args.role !== "owner",
      "Cannot promote user to owner role"
    );
    
    await ctx.db.patch(args.membershipId, { role: args.role });

    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "member_updated",
      actorType: "user",
      actorId: updaterId,
      actorName: updaterName,
      targetType: "membership",
      targetId: args.membershipId,
      targetName: membership.userName,
      meta: { newRole: args.role },
    });

    if (account) {
      await createRoleChangeNotification(
        ctx,
        args.accountId,
        membership.userId,
        args.role,
        account.name
      );
    }

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
    const { userId: removerId, userName: removerName, account } = await requireAccountAdmin(ctx, args.accountId);

    const membership = await ctx.db.get(args.membershipId);
    if (!membership) {
      throw notFoundError("Membership does not exist", { membershipId: args.membershipId });
    }

    if (membership.accountId !== args.accountId) {
      throw forbiddenError("Membership belongs to different account", {
        membershipId: args.membershipId,
        accountId: args.accountId,
      });
    }

    // Cannot remove owner
    if (membership.role === "owner") {
      throw forbiddenError("Cannot remove account owner", {
        membershipId: args.membershipId,
        role: membership.role,
      });
    }

    const removedUserId = membership.userId;
    const removedUserName = membership.userName;

    await ctx.db.delete(args.membershipId);

    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "member_removed",
      actorType: "user",
      actorId: removerId,
      actorName: removerName,
      targetType: "membership",
      targetId: args.membershipId,
      targetName: removedUserName,
    });

    if (account) {
      await createMemberRemovedNotification(
        ctx,
        args.accountId,
        removedUserId,
        account.name
      );
    }

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
      throw forbiddenError(
        "Account owner cannot leave. Transfer ownership first.",
        { accountId: args.accountId, userId: membership.userId },
      );
    }

    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "member_removed",
      actorType: "user",
      actorId: membership.userId,
      actorName: membership.userName,
      targetType: "membership",
      targetId: membership._id,
      targetName: membership.userName,
      meta: { action: "leave" },
    });

    await ctx.db.delete(membership._id);

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
    const { membership: currentOwnerMembership, account } = await requireAccountOwner(ctx, args.accountId);

    const newOwnerMembership = await ctx.db.get(args.newOwnerMembershipId);
    if (!newOwnerMembership) {
      throw notFoundError("Target membership does not exist", {
        membershipId: args.newOwnerMembershipId,
      });
    }
    
    if (newOwnerMembership.accountId !== args.accountId) {
      throw forbiddenError("Target membership belongs to different account", {
        membershipId: args.newOwnerMembershipId,
        accountId: args.accountId,
      });
    }
    
    const newOwnerUserId = newOwnerMembership.userId;
    const newOwnerUserName = newOwnerMembership.userName;
    const oldOwnerUserId = currentOwnerMembership.userId;

    await ctx.db.patch(currentOwnerMembership._id, { role: "admin" });
    await ctx.db.patch(args.newOwnerMembershipId, { role: "owner" });

    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "member_updated",
      actorType: "user",
      actorId: oldOwnerUserId,
      actorName: currentOwnerMembership.userName,
      targetType: "membership",
      targetId: args.newOwnerMembershipId,
      targetName: newOwnerUserName,
      meta: { newRole: "owner", previousOwner: oldOwnerUserId },
    });

    if (account) {
      await createRoleChangeNotification(
        ctx,
        args.accountId,
        newOwnerUserId,
        "owner",
        account.name
      );
      await createRoleChangeNotification(
        ctx,
        args.accountId,
        oldOwnerUserId,
        "admin",
        account.name
      );
    }

    return true;
  },
});
