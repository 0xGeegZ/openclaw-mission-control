import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { attachmentValidator } from "../lib/validators";
import { logActivity } from "../lib/activity";
import { ensureSubscribed } from "../subscriptions";
import { 
  extractMentionStrings, 
  resolveMentions, 
  hasAllMention,
  getAllMentions,
} from "../lib/mentions";
import { createMentionNotifications, createThreadNotifications } from "../lib/notifications";

/**
 * Create a message from an agent.
 * Called by runtime when agent posts to a thread.
 */
export const createFromAgent = internalMutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    content: v.string(),
    attachments: v.optional(v.array(attachmentValidator)),
  },
  handler: async (ctx, args) => {
    // Get agent info
    const agent = await ctx.db.get(args.agentId);
    if (!agent) {
      throw new Error("Not found: Agent does not exist");
    }
    
    // Get task info
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Not found: Task does not exist");
    }
    
    // Verify same account
    if (task.accountId !== agent.accountId) {
      throw new Error("Forbidden: Task belongs to different account");
    }
    
    // Parse and resolve mentions
    let mentions;
    
    if (hasAllMention(args.content)) {
      mentions = await getAllMentions(ctx, agent.accountId, args.agentId);
    } else {
      const mentionStrings = extractMentionStrings(args.content);
      mentions = await resolveMentions(ctx, agent.accountId, mentionStrings);
    }
    
    // Create message
    const messageId = await ctx.db.insert("messages", {
      accountId: agent.accountId,
      taskId: args.taskId,
      authorType: "agent",
      authorId: args.agentId,
      content: args.content,
      mentions,
      attachments: args.attachments,
      createdAt: Date.now(),
    });
    
    // Auto-subscribe agent to thread
    await ensureSubscribed(ctx, agent.accountId, args.taskId, "agent", args.agentId);
    
    // Auto-subscribe mentioned entities
    for (const mention of mentions) {
      await ensureSubscribed(ctx, agent.accountId, args.taskId, mention.type, mention.id);
    }
    
    // Log activity
    await logActivity({
      ctx,
      accountId: agent.accountId,
      type: "message_created",
      actorType: "agent",
      actorId: args.agentId,
      actorName: agent.name,
      targetType: "message",
      targetId: messageId,
      targetName: task.title,
      meta: { 
        taskId: args.taskId,
        mentionCount: mentions.length,
      },
    });
    
    // Create mention notifications
    if (mentions.length > 0) {
      await createMentionNotifications(
        ctx,
        agent.accountId,
        args.taskId,
        messageId,
        mentions,
        agent.name,
        task.title
      );
    }
    
    // Create thread update notifications
    const mentionedIds = new Set(mentions.map(m => m.id));
    await createThreadNotifications(
      ctx,
      agent.accountId,
      args.taskId,
      messageId,
      "agent",
      args.agentId,
      agent.name,
      task.title,
      mentionedIds
    );
    
    return messageId;
  },
});
