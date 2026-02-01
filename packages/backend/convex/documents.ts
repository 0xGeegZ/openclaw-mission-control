import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { documentTypeValidator, recipientTypeValidator } from "./lib/validators";
import { logActivity } from "./lib/activity";

/**
 * List documents for an account.
 * Supports filtering by type and task.
 */
export const list = query({
  args: {
    accountId: v.id("accounts"),
    type: v.optional(documentTypeValidator),
    taskId: v.optional(v.id("tasks")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    
    let documents;
    
    if (args.taskId) {
      // Filter by task
      documents = await ctx.db
        .query("documents")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
        .collect();
    } else {
      // Get all for account
      documents = await ctx.db
        .query("documents")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
        .collect();
    }
    
    // Filter by type if provided
    if (args.type) {
      documents = documents.filter(d => d.type === args.type);
    }
    
    // Sort by updated (most recent first)
    documents.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // Apply limit
    if (args.limit) {
      documents = documents.slice(0, args.limit);
    }
    
    return documents;
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
    let results = documents.filter(d => 
      d.title.toLowerCase().includes(searchLower) ||
      d.content.toLowerCase().includes(searchLower)
    );
    
    // Sort by relevance (title matches first, then by updated)
    results.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(searchLower);
      const bTitle = b.title.toLowerCase().includes(searchLower);
      
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
 * Create a new document.
 */
export const create = mutation({
  args: {
    accountId: v.id("accounts"),
    title: v.string(),
    content: v.string(),
    type: documentTypeValidator,
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const { userId, userName } = await requireAccountMember(ctx, args.accountId);
    
    // Validate task if provided
    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.accountId !== args.accountId) {
        throw new Error("Invalid task: Task does not exist or belongs to different account");
      }
    }
    
    const now = Date.now();
    
    const documentId = await ctx.db.insert("documents", {
      accountId: args.accountId,
      taskId: args.taskId,
      title: args.title,
      content: args.content,
      type: args.type,
      authorType: "user",
      authorId: userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: args.accountId,
      type: "document_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: documentId,
      targetName: args.title,
      meta: { type: args.type, taskId: args.taskId },
    });
    
    return documentId;
  },
});

/**
 * Update a document.
 * Increments version on content changes.
 */
export const update = mutation({
  args: {
    documentId: v.id("documents"),
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
    
    // Validate new task if provided
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
    
    if (args.title !== undefined) updates.title = args.title;
    if (args.type !== undefined) updates.type = args.type;
    if (args.taskId !== undefined) updates.taskId = args.taskId;
    
    // Increment version only on content changes
    if (args.content !== undefined && args.content !== document.content) {
      updates.content = args.content;
      updates.version = document.version + 1;
      versionIncrement = true;
    }
    
    await ctx.db.patch(args.documentId, updates);
    
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
      targetName: args.title ?? document.title,
      meta: { 
        versionIncrement,
        newVersion: versionIncrement ? document.version + 1 : document.version,
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
      targetName: document.title,
      meta: { action: args.taskId ? "linked" : "unlinked", taskId: args.taskId },
    });
    
    return args.documentId;
  },
});

/**
 * Delete a document.
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
    
    await ctx.db.delete(args.documentId);
    
    return true;
  },
});

/**
 * Duplicate a document.
 * Creates a copy with "(Copy)" appended to title.
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
    
    const { userId, userName } = await requireAccountMember(ctx, document.accountId);
    
    const now = Date.now();
    
    const newDocumentId = await ctx.db.insert("documents", {
      accountId: document.accountId,
      taskId: document.taskId,
      title: `${document.title} (Copy)`,
      content: document.content,
      type: document.type,
      authorType: "user",
      authorId: userId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    
    // Log activity
    await logActivity({
      ctx,
      accountId: document.accountId,
      type: "document_created",
      actorType: "user",
      actorId: userId,
      actorName: userName,
      targetType: "document",
      targetId: newDocumentId,
      targetName: `${document.title} (Copy)`,
      meta: { duplicatedFrom: args.documentId },
    });
    
    return newDocumentId;
  },
});
