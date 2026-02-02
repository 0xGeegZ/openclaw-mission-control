import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountAdmin } from "./lib/auth";
import { memberRoleValidator } from "./lib/validators";
import { Id } from "./_generated/dataModel";

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
    const invitationId = await ctx.db.insert("invitations", {
      accountId: args.accountId,
      email: args.email,
      role: args.role,
      invitedBy: inviterId,
      status: "pending",
      expiresAt,
      createdAt: Date.now(),
    });
    return invitationId;
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
