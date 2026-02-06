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
  v.literal("blocked"),
);

/** Agent status validator */
export const agentStatusValidator = v.union(
  v.literal("online"),
  v.literal("busy"),
  v.literal("idle"),
  v.literal("offline"),
  v.literal("error"),
);

/** Member role validator */
export const memberRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);

/** Recipient type validator */
export const recipientTypeValidator = v.union(
  v.literal("user"),
  v.literal("agent"),
);

/** Document type validator */
export const documentTypeValidator = v.union(
  v.literal("deliverable"),
  v.literal("note"),
  v.literal("template"),
  v.literal("reference"),
);

/** Document kind validator (file vs folder in tree). */
export const documentKindValidator = v.union(
  v.literal("file"),
  v.literal("folder"),
);

/** Notification type validator */
export const notificationTypeValidator = v.union(
  v.literal("mention"),
  v.literal("assignment"),
  v.literal("thread_update"),
  v.literal("status_change"),
  v.literal("member_added"),
  v.literal("member_removed"),
  v.literal("role_changed"),
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
  v.literal("member_removed"),
  v.literal("member_updated"),
);

/** Runtime status validator */
export const runtimeStatusValidator = v.union(
  v.literal("provisioning"),
  v.literal("online"),
  v.literal("degraded"),
  v.literal("offline"),
  v.literal("error"),
);

/** Mention object validator */
export const mentionValidator = v.object({
  type: recipientTypeValidator,
  id: v.string(),
  name: v.string(),
});

/** Max size per attachment (20MB). */
export const ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;

/** Allowed MIME type prefixes/values for attachments (matches UI accept). */
export const ATTACHMENT_ALLOWED_TYPES = [
  "image/",
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain", // .txt
  "text/csv",
  "application/json",
];

/** Allowed file extensions when content type is application/octet-stream. */
export const ATTACHMENT_ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "pdf",
  "doc",
  "docx",
  "txt",
  "csv",
  "json",
];

/**
 * Returns true if the given MIME type and size are allowed for attachments.
 */
export function isAttachmentTypeAndSizeAllowed(
  type: string,
  size: number,
  fileName?: string,
): boolean {
  if (size <= 0 || size > ATTACHMENT_MAX_SIZE_BYTES) return false;
  if (type === "application/octet-stream") {
    if (!fileName) return false;
    const normalized = fileName.toLowerCase();
    return ATTACHMENT_ALLOWED_EXTENSIONS.some((ext) =>
      normalized.endsWith(`.${ext}`),
    );
  }
  const allowed = ATTACHMENT_ALLOWED_TYPES.some((t) =>
    t.endsWith("/") ? type.startsWith(t) : type === t,
  );
  return allowed;
}

/** Attachment object validator for create input (storageId required for upload flow). */
export const attachmentValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  type: v.string(),
  size: v.number(),
  /** Optional; resolved from storageId in handler when omitted. */
  url: v.optional(v.string()),
});
