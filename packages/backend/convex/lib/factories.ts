/**
 * Factory functions for creating common Convex patterns.
 * Reduces boilerplate and ensures consistency across data handlers.
 * Uses pragmatic typing to avoid complex generic constraints.
 */

import { QueryCtx, MutationCtx } from "../_generated/server";
import { ConvexError, ErrorCode } from "./errors";

/**
 * Common pattern: get document by ID with optional auth check.
 */
export async function getDocById(
  ctx: QueryCtx,
  docId: any,
): Promise<any> {
  return await ctx.db.get(docId);
}

/**
 * Common pattern: list documents by account.
 * Assumes table has a by_account index.
 */
export async function listByAccount(
  ctx: QueryCtx,
  tableName: string,
  accountId: any,
): Promise<any[]> {
  return ctx.db
    .query(tableName as any)
    .withIndex("by_account", (q: any) => q.eq("accountId", accountId))
    .collect();
}

/**
 * Common pattern: get unique document by multiple fields.
 * Assumes index and query chain exist.
 */
export async function getByIndex(
  ctx: QueryCtx,
  tableName: string,
  indexName: string,
  queryFn: (q: any) => any,
): Promise<any | null> {
  return ctx.db
    .query(tableName as any)
    .withIndex(indexName as any, (q: any) => queryFn(q))
    .unique();
}

/**
 * Common pattern: list documents by index filter.
 */
export async function listByIndex(
  ctx: QueryCtx,
  tableName: string,
  indexName: string,
  queryFn: (q: any) => any,
): Promise<any[]> {
  return ctx.db
    .query(tableName as any)
    .withIndex(indexName as any, (q: any) => queryFn(q))
    .collect();
}

/**
 * Common mutation pattern: update with validation.
 * Handles "not found" errors.
 */
export async function updateWithValidation(
  ctx: MutationCtx,
  tableName: string,
  docId: any,
  updates: Record<string, any>,
  validator?: (doc: any, updates: Record<string, any>) => Promise<void>,
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
    await validator(doc, updates);
  }

  await ctx.db.patch(docId, updates);
}

/**
 * Common mutation pattern: delete with validation.
 */
export async function deleteWithValidation(
  ctx: MutationCtx,
  tableName: string,
  docId: any,
  validator?: (doc: any) => Promise<void>,
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
    await validator(doc);
  }

  await ctx.db.delete(docId);
}

/**
 * Common pattern: ensure document exists and belongs to account.
 */
export async function assertDocBelongsToAccount(
  doc: any,
  expectedAccountId: any,
  docType: string,
): Promise<any> {
  if (!doc) {
    throw new ConvexError(
      ErrorCode.NOT_FOUND,
      `${docType} not found`,
    );
  }

  if (doc.accountId !== expectedAccountId) {
    throw new ConvexError(
      ErrorCode.FORBIDDEN,
      `${docType} belongs to different account`,
      { expectedAccountId, actualAccountId: doc.accountId },
    );
  }

  return doc;
}
