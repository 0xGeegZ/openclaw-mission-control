/**
 * Shared types for LobsterControl.
 *
 * NOTE: These types must stay in sync with @packages/backend/convex/lib/constants.ts
 * and @packages/backend/convex/lib/validators.ts.
 *
 * Pattern: Types are derived from const objects for consistency.
 * The backend validators use the same pattern with Convex's Infer<> utility.
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

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

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

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

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

export type MemberRole = (typeof MEMBER_ROLE)[keyof typeof MEMBER_ROLE];

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

export type RecipientType =
  (typeof RECIPIENT_TYPE)[keyof typeof RECIPIENT_TYPE];

// ============================================================================
// DOCUMENT TYPE
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

export type DocumentType = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];

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

export type NotificationType =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

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
  DOCUMENT_DELETED: "document_deleted",
  AGENT_STATUS_CHANGED: "agent_status_changed",
  RUNTIME_STATUS_CHANGED: "runtime_status_changed",
  MEMBER_ADDED: "member_added",
  MEMBER_REMOVED: "member_removed",
  MEMBER_UPDATED: "member_updated",
  ROLE_CHANGED: "role_changed",
} as const;

export type ActivityType = (typeof ACTIVITY_TYPE)[keyof typeof ACTIVITY_TYPE];

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

export type RuntimeStatus =
  (typeof RUNTIME_STATUS)[keyof typeof RUNTIME_STATUS];

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

export type RuntimeV2Status =
  (typeof RUNTIME_V2_STATUS)[keyof typeof RUNTIME_V2_STATUS];

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

export type SkillCategory =
  (typeof SKILL_CATEGORY)[keyof typeof SKILL_CATEGORY];

// ============================================================================
// LLM MODEL
// ============================================================================

/**
 * Available LLM models for OpenClaw.
 */
export const LLM_MODEL = {
  CLAUDE_HAIKU_4_5: "claude-haiku-4.5",
  GPT_5_NANO: "gpt-5-nano",
} as const;

export type LLMModel = (typeof LLM_MODEL)[keyof typeof LLM_MODEL];

// ============================================================================
// ANALYTICS TIME RANGE
// ============================================================================

/**
 * Time range options for analytics queries (dashboard and API).
 * "custom" is API-only; UI tabs use day, week, month.
 */
export const ANALYTICS_TIME_RANGE = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  CUSTOM: "custom",
} as const;

export type AnalyticsTimeRange =
  (typeof ANALYTICS_TIME_RANGE)[keyof typeof ANALYTICS_TIME_RANGE];

// ============================================================================
// OPENCLAW CONFIG
// ============================================================================

/**
 * OpenClaw configuration for agents.
 */
export interface OpenClawConfig {
  model: LLMModel;
  temperature: number;
  maxTokens?: number;
  systemPromptPrefix?: string;
  skillIds: string[];
  contextConfig?: {
    maxHistoryMessages: number;
    includeTaskContext: boolean;
    includeTeamContext: boolean;
    customContextSources?: string[];
  };
  rateLimits?: {
    requestsPerMinute: number;
    tokensPerDay?: number;
  };
  behaviorFlags?: {
    canCreateTasks: boolean;
    canModifyTaskStatus: boolean;
    canCreateDocuments: boolean;
    canMentionAgents: boolean;
    requiresApprovalForActions?: string[];
  };
}
