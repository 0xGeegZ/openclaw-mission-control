/**
 * Factory functions for creating common Convex query and mutation patterns.
 * Reduces boilerplate and ensures consistency across data handlers.
 */

import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { ConvexError, ErrorCode } from "./errors";

/**
 * Type for query index specifications.
 */
export type QueryIndexSpec<T extends string> = {
  tableName: T;
  indexName: string;
  where: (q: any) => any;
};

/**
 * Factory for creating a simple get-by-id query handler.
 */
export function createGetHandler<T extends string>(
  tableName: T,
  requireAuth?: (ctx: QueryCtx, doc: Doc<T>) => Promise<void>,
) {
  return async (ctx: QueryCtx, docId: Id<T>): Promise<Doc<T> | null> => {
    const doc = await ctx.db.get(docId);
    if (!doc) {
      return null;
    }
    if (requireAuth) {
      await requireAuth(ctx, doc);
    }
    return doc;
  };
}

/**
 * Factory for creating a list-by-account query handler.
 */
export function createListByAccountHandler<T extends string>(
  tableName: T,
) {
  return async (ctx: QueryCtx, accountId: Id<"accounts">): Promise<Doc<T>[]> => {
    return ctx.db
      .query(tableName)
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
  };
}

/**
 * Factory for creating a list-with-filter query handler.
 */
export function createListWithFilterHandler<T extends string>(
  spec: QueryIndexSpec<T>,
) {
  return async (ctx: QueryCtx, filterValue: any): Promise<Doc<T>[]> => {
    return ctx.db
      .query(spec.tableName)
      .withIndex(spec.indexName, (q) => spec.where(q, filterValue))
      .collect();
  };
}

/**
 * Factory for creating a get-by-unique-field query handler.
 */
export function createGetByFieldHandler<T extends string>(
  spec: QueryIndexSpec<T>,
) {
  return async (ctx: QueryCtx, ...filterValues: any[]): Promise<Doc<T> | null> => {
    return ctx.db
      .query(spec.tableName)
      .withIndex(spec.indexName, (q) => {
        let result = q;
        for (const val of filterValues) {
          result = spec.where(result, val);
        }
        return result;
      })
      .unique();
  };
}

/**
 * Factory for creating a mutation handler that validates account ownership/membership.
 */
export async function validateAccountAccess(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  requireAdmin: boolean = false,
): Promise<{ userId: string; userName: string }> {
  if (requireAdmin) {
    const { userId, userName } = await ctx.auth.getUserIdentity();
    if (!userId) {
      throw new ConvexError(
        ErrorCode.UNAUTHORIZED,
        "Authentication required",
      );
    }

    const membership = await ctx.db
      .query("memberships")
      .withIndex("by_account_user", (q) =>
        q.eq("accountId", accountId).eq("userId", userId),
      )
      .unique();

    if (!membership || membership.role !== "owner" && membership.role !== "admin") {
      throw new ConvexError(
        ErrorCode.FORBIDDEN,
        "Admin access required",
        { accountId, userId },
      );
    }

    return { userId, userName: membership.userName || userId };
  }

  const { userId, userName } = await ctx.auth.getUserIdentity();
  if (!userId) {
    throw new ConvexError(
      ErrorCode.UNAUTHORIZED,
      "Authentication required",
    );
  }

  return { userId, userName: userName || userId };
}

/**
 * Factory for creating a mutation that updates a document with validation.
 */
export async function createUpdateHandler<T extends string>(
  ctx: MutationCtx,
  tableName: T,
  docId: Id<T>,
  updates: Partial<Doc<T>>,
  validator?: (doc: Doc<T>, updates: Partial<Doc<T>>) => Promise<void>,
): Promise<void> {
  const doc = await ctx.db.get(docId);
  if (!doc) {
    throw new ConvexError(
      ErrorCode.NOT_FOUND,
      `${tableName} not found`,
      { [tableName]: docId },
    );
  }

  if (validator) {
    await validator(doc, updates);
  }

  await ctx.db.patch(docId, updates);
}

/**
 * Factory for creating a mutation that deletes a document with validation.
 */
export async function createDeleteHandler<T extends string>(
  ctx: MutationCtx,
  tableName: T,
  docId: Id<T>,
  validator?: (doc: Doc<T>) => Promise<void>,
): Promise<void> {
  const doc = await ctx.db.get(docId);
  if (!doc) {
    throw new ConvexError(
      ErrorCode.NOT_FOUND,
      `${tableName} not found`,
      { [tableName]: docId },
    );
  }

  if (validator) {
    await validator(doc);
  }

  await ctx.db.delete(docId);
}
