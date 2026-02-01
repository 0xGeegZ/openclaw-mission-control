import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

/**
 * Context returned by requireAuth().
 * Contains verified user information from Clerk.
 */
export interface AuthContext {
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string;
}

/**
 * Context returned by requireAccountMember().
 * Extends AuthContext with account and membership info.
 */
export interface AccountMemberContext extends AuthContext {
  accountId: Id<"accounts">;
  membership: Doc<"memberships">;
  account: Doc<"accounts">;
}

/**
 * Verify the user is authenticated.
 * Throws if no valid identity is present.
 * 
 * @param ctx - Convex query or mutation context
 * @returns Authenticated user context
 * @throws Error if user is not authenticated
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<AuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  
  if (!identity) {
    throw new Error("Unauthenticated: No valid identity found");
  }
  
  return {
    userId: identity.subject,
    userName: identity.name ?? "Unknown",
    userEmail: identity.email ?? "",
    userAvatarUrl: identity.pictureUrl,
  };
}

/**
 * Verify the user is a member of the specified account.
 * Throws if user is not authenticated or not a member.
 * 
 * @param ctx - Convex query or mutation context
 * @param accountId - Account to check membership for
 * @returns Account member context with membership details
 * @throws Error if user is not authenticated or not a member
 */
export async function requireAccountMember(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<AccountMemberContext> {
  const authContext = await requireAuth(ctx);
  
  // Fetch account
  const account = await ctx.db.get(accountId);
  if (!account) {
    throw new Error("Not found: Account does not exist");
  }
  
  // Check membership
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_account_user", (q) => 
      q.eq("accountId", accountId).eq("userId", authContext.userId)
    )
    .unique();
  
  if (!membership) {
    throw new Error("Forbidden: User is not a member of this account");
  }
  
  return {
    ...authContext,
    accountId,
    membership,
    account,
  };
}

/**
 * Verify the user is an admin or owner of the specified account.
 * Throws if user is not authenticated, not a member, or insufficient role.
 * 
 * @param ctx - Convex query or mutation context
 * @param accountId - Account to check admin status for
 * @returns Account member context (guaranteed admin or owner role)
 * @throws Error if user lacks admin privileges
 */
export async function requireAccountAdmin(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<AccountMemberContext> {
  const memberContext = await requireAccountMember(ctx, accountId);
  
  if (memberContext.membership.role !== "owner" && 
      memberContext.membership.role !== "admin") {
    throw new Error("Forbidden: Admin or owner role required");
  }
  
  return memberContext;
}

/**
 * Verify the user is the owner of the specified account.
 * Throws if user is not the owner.
 * 
 * @param ctx - Convex query or mutation context
 * @param accountId - Account to check ownership for
 * @returns Account member context (guaranteed owner role)
 * @throws Error if user is not the owner
 */
export async function requireAccountOwner(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<AccountMemberContext> {
  const memberContext = await requireAccountMember(ctx, accountId);
  
  if (memberContext.membership.role !== "owner") {
    throw new Error("Forbidden: Owner role required");
  }
  
  return memberContext;
}

/**
 * Get the user's membership for an account, if it exists.
 * Does not throw if not a member - returns null instead.
 * 
 * @param ctx - Convex query or mutation context
 * @param accountId - Account to check
 * @returns Membership if exists, null otherwise
 */
export async function getAccountMembership(
  ctx: QueryCtx | MutationCtx,
  accountId: Id<"accounts">
): Promise<Doc<"memberships"> | null> {
  const authContext = await requireAuth(ctx);
  
  return ctx.db
    .query("memberships")
    .withIndex("by_account_user", (q) => 
      q.eq("accountId", accountId).eq("userId", authContext.userId)
    )
    .unique();
}
