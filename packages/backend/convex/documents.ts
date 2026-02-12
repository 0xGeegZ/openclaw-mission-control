import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAccountMember } from "./lib/auth";
import { documentTypeValidator, documentKindValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";
import { DOCUMENT_TYPE } from "./lib/constants";
import {
  validateDocumentParent,
  validateTaskBelongsToAccount,
  cascadeDeleteDocumentChildren,
} from "./lib/reference_validation";

/**
 * Resolve display name for a document (name ?? title ?? fallback).
 */
export function getDocumentDisplayName(
  doc: { name?: string | null; title?: string | null },
  fallback: string = "Document",
): string {
  return doc.name ?? doc.title ?? fallback;
}

/**
 * Guard against writes on soft-deleted documents.
 */
export function ensureDocumentIsActive(
  doc: { deletedAt?: number },
  action: string,
): void {
  if (doc.deletedAt) {
    throw new Error(`Cannot ${action}: Document has been deleted`);
  }
}

/**
 * List documents for an account.
 * Supports filtering by folder (parentId), type, and task.
 * Excludes soft-deleted documents by default.
 * Returns UI shape: name (name ?? title), type (kind, default "file").
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    folderId: v.optional(v.id("documents")),
    type: v.optional(documentTypeValidator),
    taskId: v.optional(v.id("tasks")),
    limit: v.optional(v.number()),
    includeSoftDeleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    let documents;

    if (args.taskId) {
      // Validate that task exists and caller has access to its account
      const task = await ctx.db.get(args.taskId);
      if (!task) {
        return [];
      }
      await requireAccountMember(ctx, task.accountId);

      documents = await ctx.db
        .query("documents")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
        .collect();
    } else {
      const parentId = args.folderId ?? undefined;
      documents = await ctx.db
        .query("documents")
        .withIndex("by_parent", (q) =>
          q.eq("accountId", args.accountId).eq("parentId", parentId),
        )
        .collect();
      documents.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    // Filter out soft-deleted documents unless explicitly requested
    if (!args.includeSoftDeleted) {
      documents = documents.filter((d) => !d.deletedAt);
    }

    if (args.type) {
      documents = documents.filter((d) => d.type === args.type);
    }

    if (args.limit) {
      documents = documents.slice(0, args.limit);
    }

    return documents.map((d) => ({
      ...d,
      name: getDocumentDisplayName(d, "Untitled"),
      type: d.kind ?? "file",
    }));
  },
});

/**
 * List documents by type for an account. Excludes soft-deleted documents.
 */
export const listByType = query({
  args: {
    accountId: v.id("accounts"),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_account_type", (q) =>
        q.eq("accountId", args.accountId).eq("type", args.type),
      )
      .collect();

    return documents.filter((d) => !d.deletedAt);
  },
});

/**
 * List documents linked to a specific task. Excludes soft-deleted documents.
 */
export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return [];
    }

    await requireAccountMember(ctx, task.accountId);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return documents.filter((d) => !d.deletedAt);
  },
});

/**
 * Get a single document by ID. Returns null if not found, soft-deleted, or caller lacks account access.
 */
export const get = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document || document.deletedAt) {
      return null;
    }

    await requireAccountMember(ctx, document.accountId);
    return document;
  },
});

/**
 * Resolve account slug for a document (for redirects from /docs/[id] or /document/[id]).
 * Returns { accountSlug } if the user has access, null if not found, soft-deleted, or no access.
 */
export const getAccountSlugForRedirect = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document || document.deletedAt) {
      return null;
    }
    await requireAccountMember(ctx, document.accountId);
    const account = await ctx.db.get(document.accountId);
    if (!account) {
      return null;
    }
    return { accountSlug: account.slug };
  },
});

/**
 * Search documents by name/title and content (case-insensitive contains).
 * Excludes soft-deleted documents.
 */
export const search = query({
  args: {
    accountId: v.id("accounts"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);

    const queryTrimmed = args.query.trim();
    if (!queryTrimmed) {
      return [];
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    const searchLower = queryTrimmed.toLowerCase();
    let results = documents
      .filter((d) => !d.deletedAt)
      .filter((d) => {
        const name = (d.name ?? d.title ?? "").toLowerCase();
        const content = (d.content ?? "").toLowerCase();
        return name.includes(searchLower) || content.includes(searchLower);
      })
      .sort((a, b) => {
        const aName = (a.name ?? a.title ?? "").toLowerCase();
        const bName = (b.name ?? b.title ?? "").toLowerCase();
        const aTitleMatch = aName.includes(searchLower);
        const bTitleMatch = bName.includes(searchLower);
        if (aTitleMatch && !bTitleMatch) return -1;
        if (!aTitleMatch && bTitleMatch) return 1;
        return b.updatedAt - a.updatedAt;
      });

    if (args.limit) {
      results = results.slice(0, args.limit);
    }

    return results;
  },
});

/**
 * Create a new document or folder.
 * For kind "file": title, content, type required. For kind "folder": name or title, content optional.
 * mimeType and size are optional for files (useful for uploaded files), ignored for folders.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    kind: v.optional(documentKindValidator),
    parentId: v.optional(v.id("documents")),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(documentTypeValidator),
    taskId: v.optional(v.id("tasks")),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountMember(
      ctx,
      args.accountId,
    );
    const isFolder = args.kind === "folder";
    const displayName =
      args.name ?? args.title ?? (isFolder ? "New Folder" : "Untitled");

    if (isFolder) {
      if (!args.name && !args.title) {
        throw new Error("Folder requires name or title");
      }
    } else {
      if (!args.title || args.content === undefined) {
        throw new Error("File requires title and content");
      }
      if (!args.type) {
        throw new Error(
          "File requires type (deliverable, note, template, or reference)",
        );
      }
    }

    if (args.parentId) {
      await validateDocumentParent(ctx.db, args.accountId, args.parentId);
    }
    if (args.taskId) {
      await validateTaskBelongsToAccount(ctx.db, args.accountId, args.taskId);
    }

    const now = Date.now();
    const doc = {
      accountId: args.accountId,
      parentId: args.parentId,
      kind: args.kind ?? "file",
      name: args.name,
      taskId: args.taskId,
      title: args.title,
      content: isFolder ? undefined : args.content,
      type: args.type,
      mimeType: isFolder ? undefined : args.mimeType,
      size: isFolder ? undefined : args.size,
      authorType: "user" as const,
      authorId: userId,
      version: isFolder ? undefined : 1,
      createdAt: now,
      updatedAt: now,
    };

    const documentId = await ctx.db.insert("documents", doc);

    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "document_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: documentId,
      targetName: displayName,
      meta: { kind: args.kind ?? "file", type: args.type, taskId: args.taskId },
    });

    return documentId;
  },
});

/**
 * Update a document.
 * Supports moving (parentId) and kind. Increments version on content changes for files.
 * Supports mimeType and size updates for files.
 */
export const update = mutation({
  args: {
    documentId: v.id("documents"),
    parentId: v.optional(v.id("documents")),
    kind: v.optional(documentKindValidator),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(documentTypeValidator),
    taskId: v.optional(v.id("tasks")),
    mimeType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }
    ensureDocumentIsActive(document, "update");

    const { userId, userName } = await requireAccountMember(
      ctx,
      document.accountId,
    );

    if (args.parentId !== undefined && args.parentId !== null) {
      await validateDocumentParent(ctx.db, document.accountId, args.parentId);
    }
    if (args.taskId !== undefined && args.taskId !== null) {
      await validateTaskBelongsToAccount(
        ctx.db,
        document.accountId,
        args.taskId,
      );
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    let versionIncrement = false;
    if (args.parentId !== undefined) updates.parentId = args.parentId;
    if (args.kind !== undefined) updates.kind = args.kind;
    if (args.name !== undefined) updates.name = args.name;
    if (args.title !== undefined) updates.title = args.title;
    if (args.type !== undefined) updates.type = args.type;
    if (args.taskId !== undefined) updates.taskId = args.taskId;
    if (args.mimeType !== undefined && document.kind !== "folder")
      updates.mimeType = args.mimeType;
    if (args.size !== undefined && document.kind !== "folder")
      updates.size = args.size;

    if (args.content !== undefined && document.kind !== "folder") {
      const prevContent = document.content ?? "";
      if (args.content !== prevContent) {
        updates.content = args.content;
        updates.version = (document.version ?? 0) + 1;
        versionIncrement = true;
      }
    }

    await ctx.db.patch(args.documentId, updates);

    const targetName = getDocumentDisplayName(
      { title: args.title ?? document.title, name: args.name ?? document.name },
      "Document",
    );
    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_updated",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: args.documentId,
      targetName,
      meta: {
        versionIncrement,
        newVersion: versionIncrement
          ? (document.version ?? 0) + 1
          : document.version,
        fields: Object.keys(updates).filter((k) => k !== "updatedAt"),
      },
    });

    return args.documentId;
  },
});

/**
 * Link or unlink a document to a task. Validates task belongs to document's account.
 */
export const linkToTask = mutation({
  args: {
    documentId: v.id("documents"),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }
    ensureDocumentIsActive(document, "link document to task");

    const { userId, userName } = await requireAccountMember(
      ctx,
      document.accountId,
    );

    if (args.taskId) {
      await validateTaskBelongsToAccount(
        ctx.db,
        document.accountId,
        args.taskId,
      );
    }

    await ctx.db.patch(args.documentId, {
      taskId: args.taskId,
      updatedAt: Date.now(),
    });

    // Log activity
    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_updated",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: args.documentId,
      targetName: getDocumentDisplayName(document),
      meta: {
        action: args.taskId ? "linked" : "unlinked",
        taskId: args.taskId,
      },
    });

    return args.documentId;
  },
});

/**
 * Recursively collect all descendant document IDs (children of folder, then their children, etc.).
 */
async function collectDescendantIds(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  parentId: Id<"documents">,
  out: Id<"documents">[],
): Promise<void> {
  const children = await ctx.db
    .query("documents")
    .withIndex("by_parent", (q) =>
      q.eq("accountId", accountId).eq("parentId", parentId),
    )
    .collect();
  for (const child of children) {
    out.push(child._id);
    if (child.kind === "folder") {
      await collectDescendantIds(ctx, accountId, child._id, out);
    }
  }
}

/**
 * Soft delete a document (set deletedAt timestamp for audit trail).
 * If it is a folder, cascade soft-deletes all descendants.
 */
export const softDelete = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      document.accountId,
    );

    const now = Date.now();

    if (document.kind === "folder") {
      const toDelete: Id<"documents">[] = [args.documentId];
      await collectDescendantIds(
        ctx,
        document.accountId,
        args.documentId,
        toDelete,
      );
      for (const docId of toDelete) {
        await ctx.db.patch(docId, { deletedAt: now, updatedAt: now });
      }
    } else {
      await ctx.db.patch(args.documentId, { deletedAt: now, updatedAt: now });
    }

    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_updated",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: args.documentId,
      targetName: getDocumentDisplayName(document),
      meta: { action: "soft_delete", deletedAt: now },
    });

    return true;
  },
});

/**
 * Hard delete a document. If it is a folder, cascade-deletes all descendants first.
 * Order: collect all descendant IDs (depth-first), then delete from leaves to root to satisfy Convex.
 * Use softDelete for audit trail; use remove for permanent deletion.
 */
export const remove = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      document.accountId,
    );

    if (document.kind === "folder") {
      await cascadeDeleteDocumentChildren(ctx.db, ctx.db, args.documentId);
    }
    await ctx.db.delete(args.documentId);

    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_updated",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: args.documentId,
      targetName: getDocumentDisplayName(document),
      meta: { action: "hard_delete" },
    });

    return true;
  },
});

/**
 * Duplicate a document (files only). Creates a copy with "(Copy)" appended to title.
 */
export const duplicate = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }
    ensureDocumentIsActive(document, "duplicate document");
    if (document.kind === "folder") {
      throw new Error("Cannot duplicate a folder");
    }

    const { userId, userName } = await requireAccountMember(
      ctx,
      document.accountId,
    );
    const title = getDocumentDisplayName(document, "Untitled");
    const now = Date.now();

    const newDocumentId = await ctx.db.insert("documents", {
      accountId: document.accountId,
      parentId: document.parentId,
      kind: "file",
      taskId: document.taskId,
      title: `${title} (Copy)`,
      content: document.content ?? "",
      type: document.type ?? DOCUMENT_TYPE.NOTE,
      mimeType: document.mimeType,
      size: document.size,
      authorType: "user",
      authorId: userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: newDocumentId,
      targetName: `${title} (Copy)`,
      meta: { duplicatedFrom: args.documentId },
    });

    return newDocumentId;
  },
});
