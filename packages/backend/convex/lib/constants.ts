/**
 * Convex backend constants.
 * Single source of truth for all enum values used in schema and validators.
 *
 * Pattern:
 * 1. Constants defined here as const objects
 * 2. Validators in validators.ts use v.literal(CONSTANT.VALUE)
 * 3. Types inferred from validators using Infer<typeof validator>
 */

// ============================================================================
// TASK STATUS
// ============================================================================

/**
 * Task status values for Kanban workflow.
 * Workflow: inbox → assigned → in_progress → review → done
 * Special states: blocked (can be entered from assigned/in_progress)
 * Terminal state: archived (soft delete with audit trail)
 */
export const TASK_STATUS = {
  INBOX: "inbox",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  REVIEW: "review",
  DONE: "done",
  BLOCKED: "blocked",
  ARCHIVED: "archived",
} as const;

/**
 * Ordered list of task statuses for Kanban columns.
 * Archived tasks are typically hidden from main board.
 */
export const TASK_STATUS_ORDER = [
  TASK_STATUS.INBOX,
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
  TASK_STATUS.DONE,
  TASK_STATUS.BLOCKED,
  TASK_STATUS.ARCHIVED,
] as const;

/**
 * Human-readable labels for task statuses.
 */
export const TASK_STATUS_LABELS = {
  [TASK_STATUS.INBOX]: "Inbox",
  [TASK_STATUS.ASSIGNED]: "Assigned",
  [TASK_STATUS.IN_PROGRESS]: "In Progress",
  [TASK_STATUS.REVIEW]: "Review",
  [TASK_STATUS.DONE]: "Done",
  [TASK_STATUS.BLOCKED]: "Blocked",
  [TASK_STATUS.ARCHIVED]: "Archived",
} as const;

/**
 * Valid status transitions.
 * Key = current status, Value = array of allowed next statuses.
 */
export const TASK_STATUS_TRANSITIONS = {
  [TASK_STATUS.INBOX]: [TASK_STATUS.ASSIGNED, TASK_STATUS.ARCHIVED],
  [TASK_STATUS.ASSIGNED]: [
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.BLOCKED,
    TASK_STATUS.INBOX,
    TASK_STATUS.ARCHIVED,
  ],
  [TASK_STATUS.IN_PROGRESS]: [
    TASK_STATUS.REVIEW,
    TASK_STATUS.BLOCKED,
    TASK_STATUS.ARCHIVED,
  ],
  [TASK_STATUS.REVIEW]: [
    TASK_STATUS.DONE,
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.BLOCKED,
    TASK_STATUS.ARCHIVED,
  ],
  [TASK_STATUS.DONE]: [TASK_STATUS.ARCHIVED],
  [TASK_STATUS.BLOCKED]: [
    TASK_STATUS.ASSIGNED,
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.ARCHIVED,
  ],
  [TASK_STATUS.ARCHIVED]: [], // Terminal state
} as const;

/**
 * Statuses from which /stop can move the task to blocked (emergency pause).
 */
export const PAUSE_ALLOWED_STATUSES = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
] as const;

// ============================================================================
// AGENT STATUS
// ============================================================================

/**
 * Agent operational status values.
 */
export const AGENT_STATUS = {
  ONLINE: "online",
  BUSY: "busy",
  IDLE: "idle",
  OFFLINE: "offline",
  ERROR: "error",
} as const;

// ============================================================================
// MEMBER ROLE
// ============================================================================

/**
 * User roles within an account (permission levels).
 */
export const MEMBER_ROLE = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

// ============================================================================
// RECIPIENT TYPE
// ============================================================================

/**
 * Recipient types for notifications and messages.
 */
export const RECIPIENT_TYPE = {
  USER: "user",
  AGENT: "agent",
} as const;

// ============================================================================
// DOCUMENT TYPE & KIND
// ============================================================================

/**
 * Document content types.
 */
export const DOCUMENT_TYPE = {
  DELIVERABLE: "deliverable",
  NOTE: "note",
  TEMPLATE: "template",
  REFERENCE: "reference",
} as const;

/**
 * Document kind (file vs folder in tree).
 */
export const DOCUMENT_KIND = {
  FILE: "file",
  FOLDER: "folder",
} as const;

// ============================================================================
// NOTIFICATION TYPE
// ============================================================================

/**
 * Notification event types.
 */
export const NOTIFICATION_TYPE = {
  MENTION: "mention",
  ASSIGNMENT: "assignment",
  THREAD_UPDATE: "thread_update",
  STATUS_CHANGE: "status_change",
  RESPONSE_REQUEST: "response_request",
  MEMBER_ADDED: "member_added",
  MEMBER_REMOVED: "member_removed",
  ROLE_CHANGED: "role_changed",
} as const;

// ============================================================================
// ACTIVITY TYPE
// ============================================================================

/**
 * Activity log event types for audit trail.
 */
export const ACTIVITY_TYPE = {
  ACCOUNT_CREATED: "account_created",
  ACCOUNT_UPDATED: "account_updated",
  TASK_CREATED: "task_created",
  TASK_UPDATED: "task_updated",
  TASK_STATUS_CHANGED: "task_status_changed",
  MESSAGE_CREATED: "message_created",
  DOCUMENT_CREATED: "document_created",
  DOCUMENT_UPDATED: "document_updated",
  AGENT_STATUS_CHANGED: "agent_status_changed",
  RUNTIME_STATUS_CHANGED: "runtime_status_changed",
  MEMBER_ADDED: "member_added",
  MEMBER_REMOVED: "member_removed",
  MEMBER_UPDATED: "member_updated",
  ROLE_CHANGED: "role_changed",
} as const;

// ============================================================================
// RUNTIME STATUS
// ============================================================================

/**
 * Per-account runtime server status (accounts.runtimeStatus).
 */
export const RUNTIME_STATUS = {
  PROVISIONING: "provisioning",
  ONLINE: "online",
  DEGRADED: "degraded",
  OFFLINE: "offline",
  ERROR: "error",
} as const;

/**
 * Runtime table status (runtimes table, includes "upgrading").
 */
export const RUNTIME_V2_STATUS = {
  PROVISIONING: "provisioning",
  ONLINE: "online",
  DEGRADED: "degraded",
  OFFLINE: "offline",
  UPGRADING: "upgrading",
  ERROR: "error",
} as const;

// ============================================================================
// ACCOUNT PLAN
// ============================================================================

/**
 * Account subscription plans.
 */
export const ACCOUNT_PLAN = {
  FREE: "free",
  PRO: "pro",
  ENTERPRISE: "enterprise",
} as const;

// ============================================================================
// SKILL CATEGORY
// ============================================================================

/**
 * Skill/tool categories for agent capabilities.
 */
export const SKILL_CATEGORY = {
  MCP_SERVER: "mcp_server",
  TOOL: "tool",
  INTEGRATION: "integration",
  CUSTOM: "custom",
} as const;

// ============================================================================
// INVITATION STATUS
// ============================================================================

/**
 * Invitation statuses for account invites.
 */
export const INVITATION_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  EXPIRED: "expired",
} as const;

// ============================================================================
// RUNTIME PROVIDER
// ============================================================================

/**
 * Cloud providers for runtime infrastructure.
 */
export const RUNTIME_PROVIDER = {
  DIGITALOCEAN: "digitalocean",
  FLY: "fly",
  AWS: "aws",
  GCP: "gcp",
} as const;

// ============================================================================
// UPGRADE STATUS
// ============================================================================

/**
 * Runtime upgrade result statuses.
 */
export const UPGRADE_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
  ROLLED_BACK: "rolled_back",
} as const;

// ============================================================================
// UPGRADE STRATEGY
// ============================================================================

/**
 * Runtime upgrade deployment strategies.
 */
export const UPGRADE_STRATEGY = {
  IMMEDIATE: "immediate",
  ROLLING: "rolling",
  CANARY: "canary",
} as const;

// ============================================================================
// ACTOR TYPE
// ============================================================================

/**
 * Actor types for activity logging.
 */
export const ACTOR_TYPE = {
  USER: "user",
  AGENT: "agent",
  SYSTEM: "system",
} as const;

// ============================================================================
// TARGET TYPE
// ============================================================================

/**
 * Target entity types for activity logging.
 */
export const TARGET_TYPE = {
  TASK: "task",
  MESSAGE: "message",
  DOCUMENT: "document",
  AGENT: "agent",
  ACCOUNT: "account",
  MEMBERSHIP: "membership",
} as const;

// ============================================================================
// AUTH TYPE
// ============================================================================

/**
 * Authentication types for skill configurations.
 */
export const AUTH_TYPE = {
  NONE: "none",
  API_KEY: "api_key",
  OAUTH: "oauth",
} as const;
