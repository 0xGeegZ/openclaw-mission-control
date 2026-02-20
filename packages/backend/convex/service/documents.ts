import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  documentTypeValidator,
  DOCUMENT_TITLE_MAX_LENGTH,
  DOCUMENT_CONTENT_MAX_LENGTH,
} from "../lib/validators";
import { logActivity } from "../lib/activity";

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
