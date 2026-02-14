/**
 * Factory functions for creating common Convex patterns.
 * Reduces boilerplate and ensures consistency across data handlers.
 * Provides type-safe helpers for queries and mutations using proper Convex types.
 */

import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { ConvexError, ErrorCode } from "./errors";

/**
 * Common pattern: get document by ID.
 */
export async function getDocById<T extends string>(
  ctx: QueryCtx,
  docId: Id<T>,
): Promise<Doc<T> | null> {
  return await ctx.db.get(docId);
}

/**
 * Common pattern: list documents by account.
 * Assumes table has a by_account index.
 */
export async function listByAccount<T extends string>(
  ctx: QueryCtx,
  tableName: string,
  accountId: Id<"accounts">,
): Promise<Doc<T>[]> {
  return (await ctx.db
    .query(tableName)
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect()) as Doc<T>[];
}

/**
 * Common pattern: get unique document by index filter.
 * QueryFn should use index builder methods (eq, gt, gte, lt, lte).
 */
export async function getByIndex<T extends string>(
  ctx: QueryCtx,
  tableName: string,
  indexName: string,
  queryFn: (q: {
    eq: (field: string, value: unknown) => unknown;
    gt: (field: string, value: unknown) => unknown;
    gte: (field: string, value: unknown) => unknown;
    lt: (field: string, value: unknown) => unknown;
    lte: (field: string, value: unknown) => unknown;
  }) => unknown,
): Promise<Doc<T> | null> {
  return (await ctx.db
    .query(tableName)
    .withIndex(indexName, (q) => queryFn(q as any))
    .unique()) as Doc<T> | null;
}

/**
 * Common pattern: list documents by index filter.
 */
export async function listByIndex<T extends string>(
  ctx: QueryCtx,
  tableName: string,
  indexName: string,
  queryFn: (q: {
    eq: (field: string, value: unknown) => unknown;
    gt: (field: string, value: unknown) => unknown;
    gte: (field: string, value: unknown) => unknown;
    lt: (field: string, value: unknown) => unknown;
    lte: (field: string, value: unknown) => unknown;
  }) => unknown,
): Promise<Doc<T>[]> {
  return (await ctx.db
    .query(tableName)
    .withIndex(indexName, (q) => queryFn(q as any))
    .collect()) as Doc<T>[];
}

/**
 * Common mutation pattern: update with validation.
 * Handles "not found" errors.
 */
export async function updateWithValidation<T extends string>(
  ctx: MutationCtx,
  tableName: string,
  docId: Id<T>,
  updates: Partial<Doc<T>>,
  validator?: (doc: Doc<T>, updates: Partial<Doc<T>>) => Promise<void>,
): Promise<void> {
  const doc = await ctx.db.get(docId);
  if (!doc) {
    throw new ConvexError(
      ErrorCode.NOT_FOUND,
      `${tableName} not found`,
      { docId },
    );
  }

  if (validator) {
    await validator(doc as Doc<T>, updates);
  }

  await ctx.db.patch(docId, updates);
}

/**
 * Common mutation pattern: delete with validation.
 */
export async function deleteWithValidation<T extends string>(
  ctx: MutationCtx,
  tableName: string,
  docId: Id<T>,
  validator?: (doc: Doc<T>) => Promise<void>,
): Promise<void> {
  const doc = await ctx.db.get(docId);
  if (!doc) {
    throw new ConvexError(
      ErrorCode.NOT_FOUND,
      `${tableName} not found`,
      { docId },
    );
  }

  if (validator) {
    await validator(doc as Doc<T>);
  }

  await ctx.db.delete(docId);
}

/**
 * Common pattern: ensure document exists and belongs to account.
 */
export async function assertDocBelongsToAccount<T extends string>(
  doc: Doc<T> | null,
  expectedAccountId: Id<"accounts">,
  docType: string,
): Promise<Doc<T>> {
  if (!doc) {
    throw new ConvexError(
      ErrorCode.NOT_FOUND,
      `${docType} not found`,
    );
  }

  const docWithAccount = doc as Doc<T> & { accountId: Id<"accounts"> };
  if (docWithAccount.accountId !== expectedAccountId) {
    throw new ConvexError(
      ErrorCode.FORBIDDEN,
      `${docType} belongs to different account`,
      { expectedAccountId, actualAccountId: docWithAccount.accountId },
    );
  }

  return doc;
}
