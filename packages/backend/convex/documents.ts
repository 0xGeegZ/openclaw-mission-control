import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAccountMember } from "./lib/auth";
import { documentTypeValidator, documentKindValidator, recipientTypeValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";

/**
 * List documents for an account.
 * Supports filtering by folder (parentId), type, and task.
 * Returns UI shape: name (name ?? title), type (kind, default "file").
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    folderId: v.optional(v.id("documents")),
    type: v.optional(documentTypeValidator),
    taskId: v.optional(v.id("tasks")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    let documents;
    
    if (args.taskId) {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
        .collect();
    } else {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_parent", (q) =>
          q.eq("accountId", args.accountId).eq("parentId", args.folderId)
        )
        .collect();
    }
    
    if (args.type) {
      documents = documents.filter(d => d.type === args.type);
    }
    
    documents.sort((a, b) => b.updatedAt - a.updatedAt);
    
    if (args.limit) {
      documents = documents.slice(0, args.limit);
    }
    
    return documents.map(d => ({
      ...d,
      name: d.name ?? d.title ?? "Untitled",
      type: d.kind ?? "file",
    }));
  },
});

/**
 * List documents by type.
 */
export const listByType = query({
  args: {
    accountId: v.id("accounts"),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    return ctx.db
      .query("documents")
      .withIndex("by_account_type", (q) => 
        q.eq("accountId", args.accountId).eq("type", args.type)
      )
      .collect();
  },
});

/**
 * List documents linked to a specific task.
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
    
    return ctx.db
      .query("documents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});

/**
 * Get a single document by ID.
 */
export const get = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      return null;
    }
    
    await requireAccountMember(ctx, document.accountId);
    return document;
  },
});

/**
 * Search documents by title.
 * Simple text search (case-insensitive contains).
 */
export const search = query({
  args: {
    accountId: v.id("accounts"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    
    const searchLower = args.query.toLowerCase();
    let results = documents.filter(d => {
      const title = d.title ?? d.name ?? "";
      const content = d.content ?? "";
      return title.toLowerCase().includes(searchLower) || content.toLowerCase().includes(searchLower);
    });

    results.sort((a, b) => {
      const aTitle = (a.title ?? a.name ?? "").toLowerCase().includes(searchLower);
      const bTitle = (b.title ?? b.name ?? "").toLowerCase().includes(searchLower);
      
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      
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
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountMember(ctx, args.accountId);
    const isFolder = args.kind === "folder";
    const displayName = args.name ?? args.title ?? (isFolder ? "New Folder" : "Untitled");

    if (isFolder) {
      if (!args.name && !args.title) {
        throw new Error("Folder requires name or title");
      }
    } else {
      if (!args.title || args.content === undefined) {
        throw new Error("File requires title and content");
      }
      if (!args.type) {
        throw new Error("File requires type (deliverable, note, template, or reference)");
      }
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.accountId !== args.accountId) {
        throw new Error("Invalid parent: Folder does not exist or belongs to different account");
      }
      if (parent.kind !== "folder") {
        throw new Error("Parent must be a folder");
      }
    }

    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.accountId !== args.accountId) {
        throw new Error("Invalid task: Task does not exist or belongs to different account");
      }
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
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Not found: Document does not exist");
    }

    const { userId, userName } = await requireAccountMember(ctx, document.accountId);

    if (args.parentId !== undefined) {
      if (args.parentId !== null) {
        const parent = await ctx.db.get(args.parentId);
        if (!parent || parent.accountId !== document.accountId) {
          throw new Error("Invalid parent: Folder does not exist or belongs to different account");
        }
        if (parent.kind !== "folder") {
          throw new Error("Parent must be a folder");
        }
      }
    }

    if (args.taskId !== undefined && args.taskId !== null) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.accountId !== document.accountId) {
        throw new Error("Invalid task");
      }
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

    if (args.content !== undefined && document.kind !== "folder") {
      const prevContent = document.content ?? "";
      if (args.content !== prevContent) {
        updates.content = args.content;
        updates.version = (document.version ?? 0) + 1;
        versionIncrement = true;
      }
    }

    await ctx.db.patch(args.documentId, updates);

    const targetName = args.title ?? args.name ?? document.title ?? document.name ?? "Document";
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
        newVersion: versionIncrement ? (document.version ?? 0) + 1 : document.version,
        fields: Object.keys(updates).filter(k => k !== "updatedAt"),
      },
    });

    return args.documentId;
  },
});

/**
 * Link/unlink a document to a task.
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
    
    const { userId, userName } = await requireAccountMember(ctx, document.accountId);
    
    // Validate task if linking
    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.accountId !== document.accountId) {
        throw new Error("Invalid task");
      }
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
      targetName: document.title ?? document.name ?? "Document",
      meta: { action: args.taskId ? "linked" : "unlinked", taskId: args.taskId },
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
  out: Id<"documents">[]
): Promise<void> {
  const children = await ctx.db
    .query("documents")
    .withIndex("by_parent", (q) => q.eq("accountId", accountId).eq("parentId", parentId))
    .collect();
  for (const child of children) {
    out.push(child._id);
    if (child.kind === "folder") {
      await collectDescendantIds(ctx, accountId, child._id, out);
    }
  }
}

/**
 * Delete a document. If it is a folder, cascade-deletes all descendants first.
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

    await requireAccountMember(ctx, document.accountId);

    if (document.kind === "folder") {
      const toDelete: Id<"documents">[] = [args.documentId];
      await collectDescendantIds(ctx, document.accountId, args.documentId, toDelete);
      for (let i = toDelete.length - 1; i >= 0; i--) {
        await ctx.db.delete(toDelete[i]!);
      }
    } else {
      await ctx.db.delete(args.documentId);
    }

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
    if (document.kind === "folder") {
      throw new Error("Cannot duplicate a folder");
    }

    const { userId, userName } = await requireAccountMember(ctx, document.accountId);
    const title = document.title ?? document.name ?? "Untitled";
    const now = Date.now();

    const newDocumentId = await ctx.db.insert("documents", {
      accountId: document.accountId,
      parentId: document.parentId,
      kind: "file",
      taskId: document.taskId,
      title: `${title} (Copy)`,
      content: document.content ?? "",
      type: document.type ?? "note",
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
