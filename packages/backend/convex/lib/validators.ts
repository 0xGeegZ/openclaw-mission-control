/**
 * Shared validators for Convex functions.
 * Import these to ensure consistent validation across all mutations/queries.
 *
 * Pattern:
 * 1. Constants defined in constants.ts as const objects
 * 2. Validators here use v.literal(CONSTANT.VALUE)
 * 3. Types inferred from validators using Infer<typeof validator>
 */
import { Infer, v } from "convex/values";

import {
  TASK_STATUS,
  AGENT_STATUS,
  ANALYTICS_TIME_RANGE,
  MEMBER_ROLE,
  RECIPIENT_TYPE,
  DOCUMENT_TYPE,
  DOCUMENT_KIND,
  NOTIFICATION_TYPE,
  ACTIVITY_TYPE,
  RUNTIME_STATUS,
  RUNTIME_V2_STATUS,
  ACCOUNT_PLAN,
  SKILL_CATEGORY,
  INVITATION_STATUS,
  RUNTIME_PROVIDER,
  UPGRADE_STATUS,
  UPGRADE_STRATEGY,
  ACTOR_TYPE,
  TARGET_TYPE,
  AUTH_TYPE,
} from "./constants";

// ============================================================================
// TASK STATUS
// ============================================================================

/**
 * Task status validator for Convex functions.
 */
export const taskStatusValidator = v.union(
  v.literal(TASK_STATUS.INBOX),
  v.literal(TASK_STATUS.ASSIGNED),
  v.literal(TASK_STATUS.IN_PROGRESS),
  v.literal(TASK_STATUS.REVIEW),
  v.literal(TASK_STATUS.DONE),
  v.literal(TASK_STATUS.BLOCKED),
  v.literal(TASK_STATUS.ARCHIVED),
);

/**
 * Task status type inferred from validator.
 */
export type TaskStatus = Infer<typeof taskStatusValidator>;

// ============================================================================
// AGENT STATUS
// ============================================================================

/**
 * Agent status validator for Convex functions.
 */
export const agentStatusValidator = v.union(
  v.literal(AGENT_STATUS.ONLINE),
  v.literal(AGENT_STATUS.BUSY),
  v.literal(AGENT_STATUS.IDLE),
  v.literal(AGENT_STATUS.OFFLINE),
  v.literal(AGENT_STATUS.ERROR),
);

/**
 * Agent status type inferred from validator.
 */
export type AgentStatus = Infer<typeof agentStatusValidator>;

// ============================================================================
// ANALYTICS TIME RANGE
// ============================================================================

/**
 * Analytics time range validator for Convex queries (getMetrics, getAgentStats, getMemberActivity).
 */
export const analyticsTimeRangeValidator = v.union(
  v.literal(ANALYTICS_TIME_RANGE.DAY),
  v.literal(ANALYTICS_TIME_RANGE.WEEK),
  v.literal(ANALYTICS_TIME_RANGE.MONTH),
  v.literal(ANALYTICS_TIME_RANGE.CUSTOM),
);

/**
 * Analytics time range type inferred from validator.
 */
export type AnalyticsTimeRange = Infer<typeof analyticsTimeRangeValidator>;

// ============================================================================
// MEMBER ROLE
// ============================================================================

/**
 * Member role validator for Convex functions.
 */
export const memberRoleValidator = v.union(
  v.literal(MEMBER_ROLE.OWNER),
  v.literal(MEMBER_ROLE.ADMIN),
  v.literal(MEMBER_ROLE.MEMBER),
);

/**
 * Member role type inferred from validator.
 */
export type MemberRole = Infer<typeof memberRoleValidator>;

// ============================================================================
// RECIPIENT TYPE
// ============================================================================

/**
 * Recipient type validator for Convex functions.
 */
export const recipientTypeValidator = v.union(
  v.literal(RECIPIENT_TYPE.USER),
  v.literal(RECIPIENT_TYPE.AGENT),
);

/**
 * Recipient type inferred from validator.
 */
export type RecipientType = Infer<typeof recipientTypeValidator>;

// ============================================================================
// DOCUMENT TYPE & KIND
// ============================================================================

/**
 * Document type validator for Convex functions.
 */
export const documentTypeValidator = v.union(
  v.literal(DOCUMENT_TYPE.DELIVERABLE),
  v.literal(DOCUMENT_TYPE.NOTE),
  v.literal(DOCUMENT_TYPE.TEMPLATE),
  v.literal(DOCUMENT_TYPE.REFERENCE),
);

/**
 * Document type inferred from validator.
 */
export type DocumentType = Infer<typeof documentTypeValidator>;

/**
 * Document kind validator (file vs folder in tree).
 */
export const documentKindValidator = v.union(
  v.literal(DOCUMENT_KIND.FILE),
  v.literal(DOCUMENT_KIND.FOLDER),
);

/**
 * Document kind type inferred from validator.
 */
export type DocumentKind = Infer<typeof documentKindValidator>;

// ============================================================================
// NOTIFICATION TYPE
// ============================================================================

/**
 * Notification type validator for Convex functions.
 */
export const notificationTypeValidator = v.union(
  v.literal(NOTIFICATION_TYPE.MENTION),
  v.literal(NOTIFICATION_TYPE.ASSIGNMENT),
  v.literal(NOTIFICATION_TYPE.THREAD_UPDATE),
  v.literal(NOTIFICATION_TYPE.STATUS_CHANGE),
  v.literal(NOTIFICATION_TYPE.RESPONSE_REQUEST),
  v.literal(NOTIFICATION_TYPE.MEMBER_ADDED),
  v.literal(NOTIFICATION_TYPE.MEMBER_REMOVED),
  v.literal(NOTIFICATION_TYPE.ROLE_CHANGED),
);

/**
 * Notification type inferred from validator.
 */
export type NotificationType = Infer<typeof notificationTypeValidator>;

// ============================================================================
// ACTIVITY TYPE
// ============================================================================

/**
 * Activity type validator for Convex functions.
 */
export const activityTypeValidator = v.union(
  v.literal(ACTIVITY_TYPE.ACCOUNT_CREATED),
  v.literal(ACTIVITY_TYPE.ACCOUNT_UPDATED),
  v.literal(ACTIVITY_TYPE.TASK_CREATED),
  v.literal(ACTIVITY_TYPE.TASK_UPDATED),
  v.literal(ACTIVITY_TYPE.TASK_STATUS_CHANGED),
  v.literal(ACTIVITY_TYPE.MESSAGE_CREATED),
  v.literal(ACTIVITY_TYPE.DOCUMENT_CREATED),
  v.literal(ACTIVITY_TYPE.DOCUMENT_UPDATED),
  v.literal(ACTIVITY_TYPE.DOCUMENT_DELETED),
  v.literal(ACTIVITY_TYPE.AGENT_STATUS_CHANGED),
  v.literal(ACTIVITY_TYPE.RUNTIME_STATUS_CHANGED),
  v.literal(ACTIVITY_TYPE.MEMBER_ADDED),
  v.literal(ACTIVITY_TYPE.MEMBER_REMOVED),
  v.literal(ACTIVITY_TYPE.MEMBER_UPDATED),
  v.literal(ACTIVITY_TYPE.ROLE_CHANGED),
);

/**
 * Activity type inferred from validator.
 */
export type ActivityType = Infer<typeof activityTypeValidator>;

// ============================================================================
// RUNTIME STATUS
// ============================================================================

/**
 * Runtime status validator for Convex functions.
 */
export const runtimeStatusValidator = v.union(
  v.literal(RUNTIME_STATUS.PROVISIONING),
  v.literal(RUNTIME_STATUS.ONLINE),
  v.literal(RUNTIME_STATUS.DEGRADED),
  v.literal(RUNTIME_STATUS.OFFLINE),
  v.literal(RUNTIME_STATUS.ERROR),
);

/**
 * Runtime status type inferred from validator.
 */
export type RuntimeStatus = Infer<typeof runtimeStatusValidator>;

/**
 * Runtime v2 status validator (runtimes table, includes "upgrading").
 */
export const runtimeV2StatusValidator = v.union(
  v.literal(RUNTIME_V2_STATUS.PROVISIONING),
  v.literal(RUNTIME_V2_STATUS.ONLINE),
  v.literal(RUNTIME_V2_STATUS.DEGRADED),
  v.literal(RUNTIME_V2_STATUS.OFFLINE),
  v.literal(RUNTIME_V2_STATUS.UPGRADING),
  v.literal(RUNTIME_V2_STATUS.ERROR),
);

/**
 * Runtime v2 status type inferred from validator.
 */
export type RuntimeV2Status = Infer<typeof runtimeV2StatusValidator>;

// ============================================================================
// ACCOUNT PLAN
// ============================================================================

/**
 * Account plan validator for Convex functions.
 */
export const accountPlanValidator = v.union(
  v.literal(ACCOUNT_PLAN.FREE),
  v.literal(ACCOUNT_PLAN.PRO),
  v.literal(ACCOUNT_PLAN.ENTERPRISE),
);

/**
 * Account plan type inferred from validator.
 */
export type AccountPlan = Infer<typeof accountPlanValidator>;

// ============================================================================
// SKILL CATEGORY
// ============================================================================

/**
 * Skill category validator for Convex functions.
 */
export const skillCategoryValidator = v.union(
  v.literal(SKILL_CATEGORY.MCP_SERVER),
  v.literal(SKILL_CATEGORY.TOOL),
  v.literal(SKILL_CATEGORY.INTEGRATION),
  v.literal(SKILL_CATEGORY.CUSTOM),
);

/**
 * Skill category type inferred from validator.
 */
export type SkillCategory = Infer<typeof skillCategoryValidator>;

// ============================================================================
// INVITATION STATUS
// ============================================================================

/**
 * Invitation status validator for Convex functions.
 */
export const invitationStatusValidator = v.union(
  v.literal(INVITATION_STATUS.PENDING),
  v.literal(INVITATION_STATUS.ACCEPTED),
  v.literal(INVITATION_STATUS.EXPIRED),
);

/**
 * Invitation status type inferred from validator.
 */
export type InvitationStatus = Infer<typeof invitationStatusValidator>;

// ============================================================================
// RUNTIME PROVIDER
// ============================================================================

/**
 * Runtime provider validator for Convex functions.
 */
export const runtimeProviderValidator = v.union(
  v.literal(RUNTIME_PROVIDER.DIGITALOCEAN),
  v.literal(RUNTIME_PROVIDER.FLY),
  v.literal(RUNTIME_PROVIDER.AWS),
  v.literal(RUNTIME_PROVIDER.GCP),
);

/**
 * Runtime provider type inferred from validator.
 */
export type RuntimeProvider = Infer<typeof runtimeProviderValidator>;

// ============================================================================
// UPGRADE STATUS
// ============================================================================

/**
 * Upgrade status validator for Convex functions.
 */
export const upgradeStatusValidator = v.union(
  v.literal(UPGRADE_STATUS.SUCCESS),
  v.literal(UPGRADE_STATUS.FAILED),
  v.literal(UPGRADE_STATUS.ROLLED_BACK),
);

/**
 * Upgrade status type inferred from validator.
 */
export type UpgradeStatus = Infer<typeof upgradeStatusValidator>;

// ============================================================================
// UPGRADE STRATEGY
// ============================================================================

/**
 * Upgrade strategy validator for Convex functions.
 */
export const upgradeStrategyValidator = v.union(
  v.literal(UPGRADE_STRATEGY.IMMEDIATE),
  v.literal(UPGRADE_STRATEGY.ROLLING),
  v.literal(UPGRADE_STRATEGY.CANARY),
);

/**
 * Upgrade strategy type inferred from validator.
 */
export type UpgradeStrategy = Infer<typeof upgradeStrategyValidator>;

// ============================================================================
// ACTOR TYPE
// ============================================================================

/**
 * Actor type validator for activity logging.
 */
export const actorTypeValidator = v.union(
  v.literal(ACTOR_TYPE.USER),
  v.literal(ACTOR_TYPE.AGENT),
  v.literal(ACTOR_TYPE.SYSTEM),
);

/**
 * Actor type inferred from validator.
 */
export type ActorType = Infer<typeof actorTypeValidator>;

// ============================================================================
// TARGET TYPE
// ============================================================================

/**
 * Target type validator for activity logging.
 */
export const targetTypeValidator = v.union(
  v.literal(TARGET_TYPE.TASK),
  v.literal(TARGET_TYPE.MESSAGE),
  v.literal(TARGET_TYPE.DOCUMENT),
  v.literal(TARGET_TYPE.AGENT),
  v.literal(TARGET_TYPE.ACCOUNT),
  v.literal(TARGET_TYPE.MEMBERSHIP),
);

/**
 * Target type inferred from validator.
 */
export type TargetType = Infer<typeof targetTypeValidator>;

// ============================================================================
// AUTH TYPE
// ============================================================================

/**
 * Auth type validator for skill configurations.
 */
export const authTypeValidator = v.union(
  v.literal(AUTH_TYPE.NONE),
  v.literal(AUTH_TYPE.API_KEY),
  v.literal(AUTH_TYPE.OAUTH),
);

/**
 * Auth type inferred from validator.
 */
export type AuthType = Infer<typeof authTypeValidator>;

/** Mention object validator */
export const mentionValidator = v.object({
  type: recipientTypeValidator,
  id: v.string(),
  name: v.string(),
});

/** Max size per attachment (20MB). */
export const ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;

/** Maximum message content length (characters) to prevent DoS and abuse. */
export const MESSAGE_CONTENT_MAX_LENGTH = 100_000;

/** Maximum account-shared USER.md content length (characters). */
export const USER_MD_MAX_LENGTH = 50_000;

/** Maximum per-agent IDENTITY.md content length (characters). */
export const IDENTITY_CONTENT_MAX_LENGTH = 50_000;

/** Maximum document title length (characters). */
export const DOCUMENT_TITLE_MAX_LENGTH = 2_000;

/** Maximum document content length (characters) to prevent storage/DoS. */
export const DOCUMENT_CONTENT_MAX_LENGTH = 1_000_000;

/** Maximum task title length (characters). Aligns with document title limit. */
export const TASK_TITLE_MAX_LENGTH = 2_000;

/** Maximum task description length (characters) to prevent storage/DoS. */
export const TASK_DESCRIPTION_MAX_LENGTH = 100_000;

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
