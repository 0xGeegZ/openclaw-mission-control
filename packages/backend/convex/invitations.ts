import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountAdmin, requireAuth } from "./lib/auth";
import { memberRoleValidator } from "./lib/validators";
import { Id } from "./_generated/dataModel";

/** Generate a URL-safe token for invite links. */
function generateInviteToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

const INVITATION_EXPIRY_DAYS = 7;

/**
 * List pending invitations for an account.
 */
export const listByAccount = query({
  args: {
    accountId: v.id("accounts"),
    status: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("expired"))),
  },
  handler: async (ctx, args) => {
    await requireAccountAdmin(ctx, args.accountId);
    let q = ctx.db
      .query("invitations")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId));
    const invitations = await q.collect();
    if (args.status) {
      return invitations.filter((i) => i.status === args.status);
    }
    return invitations;
  },
});

/**
 * Create an invitation (invite by email).
 * Requires admin. Role cannot be owner.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    email: v.string(),
    role: memberRoleValidator,
  },
  handler: async (ctx, args) => {
    const { userId: inviterId } = await requireAccountAdmin(ctx, args.accountId);
    if (args.role === "owner") {
      throw new Error("Forbidden: Cannot invite as owner");
    }
    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_account", (index) => index.eq("accountId", args.accountId))
      .collect();
    const pendingSameEmail = existing.find(
      (i) => i.email.toLowerCase() === args.email.toLowerCase() && i.status === "pending"
    );
    if (pendingSameEmail) {
      throw new Error("Conflict: An invitation for this email is already pending");
    }
    const expiresAt = Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const token = generateInviteToken();
    const invitationId = await ctx.db.insert("invitations", {
      accountId: args.accountId,
      email: args.email,
      role: args.role,
      invitedBy: inviterId,
      token,
      status: "pending",
      expiresAt,
      createdAt: Date.now(),
    });
    return invitationId;
  },
});

/**
 * Get a pending invitation by its link token (public).
 * Returns null if not found, expired, or already used.
 */
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (
      !invitation ||
      invitation.status !== "pending" ||
      invitation.expiresAt < Date.now()
    ) {
      return null;
    }
    const account = await ctx.db.get(invitation.accountId);
    if (!account) return null;
    return {
      accountId: invitation.accountId,
      accountName: account.name,
      role: invitation.role,
    };
  },
});

/**
 * Accept an invitation by token (authenticated user).
 * Creates membership and marks invitation accepted; returns account slug for redirect.
 */
export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (
      !invitation ||
      invitation.status !== "pending" ||
      invitation.expiresAt < Date.now()
    ) {
      throw new Error("Invalid or expired invitation");
    }
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) =>
        q.eq("accountId", invitation.accountId).eq("userId", identity.userId)
      )
      .unique();
    if (existing) {
      throw new Error("You are already a member of this workspace");
    }
    await ctx.db.insert("memberships", {
      accountId: invitation.accountId,
      userId: identity.userId,
      userName: identity.userName,
      userEmail: identity.userEmail,
      userAvatarUrl: identity.userAvatarUrl,
      role: invitation.role,
      joinedAt: Date.now(),
    });
    await ctx.db.patch(invitation._id, { status: "accepted" });
    const account = await ctx.db.get(invitation.accountId);
    if (!account) throw new Error("Account not found");
    return { accountSlug: account.slug };
  },
});

/**
 * Mark an invitation as accepted (e.g. after user signs up and joins).
 */
export const markAccepted = mutation({
  args: {
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Not found: Invitation does not exist");
    }
    await requireAccountAdmin(ctx, invitation.accountId);
    if (invitation.status !== "pending") {
      throw new Error("Conflict: Invitation is no longer pending");
    }
    await ctx.db.patch(args.invitationId, { status: "accepted" });
    return true;
  },
});

/**
 * Cancel (revoke) a pending invitation.
 */
export const cancel = mutation({
  args: {
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      return true;
    }
    await requireAccountAdmin(ctx, invitation.accountId);
    if (invitation.status === "pending") {
      await ctx.db.patch(args.invitationId, { status: "expired" });
    }
    return true;
  },
});
