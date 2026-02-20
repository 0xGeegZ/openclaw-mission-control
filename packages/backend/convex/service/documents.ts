import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  documentTypeValidator,
  DOCUMENT_TITLE_MAX_LENGTH,
  DOCUMENT_CONTENT_MAX_LENGTH,
} from "../lib/validators";
import { logActivity } from "../lib/activity";

/** Display name for list: name ?? title ?? "Untitled". */
function documentDisplayTitle(doc: {
  name?: string | null;
  title?: string | null;
}): string {
  return doc.name ?? doc.title ?? "Untitled";
}

/**
 * List documents for agent tools (internal, service-only).
 * Uses by_account_updated when no taskId; by_task when taskId provided.
 * Excludes soft-deleted; returns minimal shape (no content).
 */
export const listForAgentTool = internalQuery({
  args: {
    accountId: v.id("accounts"),
    taskId: v.optional(v.id("tasks")),
    type: v.optional(documentTypeValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 100);
    const accountId = args.accountId;
    const typeFilter = args.type;

    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task || task.accountId !== accountId) {
        return [];
      }
      const docs = await ctx.db
        .query("documents")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId!))
        .collect();
      let filtered = docs.filter(
        (d) => !d.deletedAt && d.accountId === accountId,
      );
      if (typeFilter) {
        filtered = filtered.filter((d) => d.type === typeFilter);
      }
      return filtered
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit)
        .map((d) => ({
          _id: d._id,
          title: documentDisplayTitle(d),
          type: d.type,
          taskId: d.taskId,
          updatedAt: d.updatedAt,
        }));
    }

    const fetchLimit = Math.min(limit * 2, 100);
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_account_updated", (q) => q.eq("accountId", accountId))
      .order("desc")
      .take(fetchLimit);
    const filtered = docs.filter((d) => !d.deletedAt);
    const byType = typeFilter
      ? filtered.filter((d) => d.type === typeFilter)
      : filtered;
    return byType.slice(0, limit).map((d) => ({
      _id: d._id,
      title: documentDisplayTitle(d),
      type: d.type,
      taskId: d.taskId,
      updatedAt: d.updatedAt,
    }));
  },
});

/**
 * Service-only document functions.
 * Called by agents via the runtime service (no user auth; uses agent identity).
 */

/**
 * Create or update a document from an agent.
 * If documentId is provided, updates existing; otherwise creates a new file.
 * Validates agent exists and document (when updating) belongs to agent's account.
 */
export const createOrUpdateFromAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    documentId: v.optional(v.id("documents")),
    taskId: v.optional(v.id("tasks")),
    title: v.string(),
    content: v.string(),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    if (args.title.length > DOCUMENT_TITLE_MAX_LENGTH) {
      throw new Error(
        `Title too long (max ${DOCUMENT_TITLE_MAX_LENGTH} characters)`,
      );
    }
    if (args.content.length > DOCUMENT_CONTENT_MAX_LENGTH) {
      throw new Error(
        `Content too long (max ${DOCUMENT_CONTENT_MAX_LENGTH} characters)`,
      );
    }

    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }

    const now = Date.now();

    if (args.documentId) {
      // Update existing document
      const document = await ctx.db.get(args.documentId);
      if (!document) {
        throw new Error("Not found: Document does not exist");
      }

      if (document.accountId !== agent.accountId) {
        throw new Error("Forbidden: Document belongs to different account");
      }

      const versionIncrement = args.content !== document.content;

      const currentVersion = document.version ?? 0;
      await ctx.db.patch(args.documentId, {
        title: args.title,
        content: args.content,
        type: args.type,
        taskId: args.taskId,
        version: versionIncrement ? currentVersion + 1 : currentVersion,
        updatedAt: now,
      });

      await logActivity({
        ctx,
        accountId: agent.accountId,
        type: "document_updated",
        actorType: "agent",
        actorId: args.agentId,
        actorName: agent.name,
        targetType: "document",
        targetId: args.documentId,
        targetName: args.title,
        meta: {
          versionIncrement,
          newVersion: versionIncrement ? currentVersion + 1 : currentVersion,
        },
      });

      return args.documentId;
    } else {
      // Create new document
      const documentId = await ctx.db.insert("documents", {
        accountId: agent.accountId,
        taskId: args.taskId,
        kind: "file",
        title: args.title,
        content: args.content,
        type: args.type,
        authorType: "agent",
        authorId: args.agentId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      // Log activity
      await logActivity({
        ctx,
        accountId: agent.accountId,
        type: "document_created",
        actorType: "agent",
        actorId: args.agentId,
        actorName: agent.name,
        targetType: "document",
        targetId: documentId,
        targetName: args.title,
        meta: { type: args.type, taskId: args.taskId },
      });

      return documentId;
    }
  },
});
