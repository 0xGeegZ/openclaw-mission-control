/**
 * Shared validators for Convex functions.
 * Import these to ensure consistent validation across all mutations/queries.
 */
import { v } from "convex/values";

/** Task status validator */
export const taskStatusValidator = v.union(
  v.literal("inbox"),
  v.literal("assigned"),
  v.literal("in_progress"),
  v.literal("review"),
  v.literal("done"),
  v.literal("blocked")
);

/** Agent status validator */
export const agentStatusValidator = v.union(
  v.literal("online"),
  v.literal("busy"),
  v.literal("idle"),
  v.literal("offline"),
  v.literal("error")
);

/** Member role validator */
export const memberRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member")
);

/** Recipient type validator */
export const recipientTypeValidator = v.union(
  v.literal("user"),
  v.literal("agent")
);

/** Document type validator */
export const documentTypeValidator = v.union(
  v.literal("deliverable"),
  v.literal("note"),
  v.literal("template"),
  v.literal("reference")
);

/** Notification type validator */
export const notificationTypeValidator = v.union(
  v.literal("mention"),
  v.literal("assignment"),
  v.literal("thread_update"),
  v.literal("status_change")
);

/** Activity type validator */
export const activityTypeValidator = v.union(
  v.literal("task_created"),
  v.literal("task_updated"),
  v.literal("task_status_changed"),
  v.literal("message_created"),
  v.literal("document_created"),
  v.literal("document_updated"),
  v.literal("agent_status_changed"),
  v.literal("runtime_status_changed"),
  v.literal("member_added"),
  v.literal("member_removed")
);

/** Runtime status validator */
export const runtimeStatusValidator = v.union(
  v.literal("provisioning"),
  v.literal("online"),
  v.literal("degraded"),
  v.literal("offline"),
  v.literal("error")
);

/** Mention object validator */
export const mentionValidator = v.object({
  type: recipientTypeValidator,
  id: v.string(),
  name: v.string(),
});

/** Attachment object validator */
export const attachmentValidator = v.object({
  name: v.string(),
  url: v.string(),
  type: v.string(),
  size: v.number(),
});
