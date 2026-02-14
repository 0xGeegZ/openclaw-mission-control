/**
 * Shared constants for OpenClaw Mission Control.
 *
 * NOTE: These constants must stay in sync with @packages/backend/convex/lib/constants.ts.
 * Use the same const object pattern for consistency.
 */
import {
  TASK_STATUS,
  AGENT_STATUS,
  ANALYTICS_TIME_RANGE,
  ACTIVITY_TYPE,
  NOTIFICATION_TYPE,
  SKILL_CATEGORY,
  LLM_MODEL,
  RUNTIME_STATUS,
  RUNTIME_V2_STATUS,
  type TaskStatus,
  type AgentStatus,
  type AnalyticsTimeRange,
  type ActivityType,
  type NotificationType,
  type LLMModel,
  type SkillCategory,
} from "../types";

// Re-export const objects from types for convenience
export {
  TASK_STATUS,
  AGENT_STATUS,
  ANALYTICS_TIME_RANGE,
  ACTIVITY_TYPE,
  NOTIFICATION_TYPE,
  SKILL_CATEGORY,
  LLM_MODEL,
  RUNTIME_STATUS,
  RUNTIME_V2_STATUS,
};

/**
 * Ordered list of task statuses for Kanban columns.
 * Archived tasks are typically hidden from main board but accessible in history/archive views.
 */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  TASK_STATUS.INBOX,
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
  TASK_STATUS.DONE,
  TASK_STATUS.BLOCKED,
  TASK_STATUS.ARCHIVED,
];

/**
 * Human-readable labels for task statuses.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TASK_STATUS.INBOX]: "Inbox",
  [TASK_STATUS.ASSIGNED]: "Assigned",
  [TASK_STATUS.IN_PROGRESS]: "In Progress",
  [TASK_STATUS.REVIEW]: "Review",
  [TASK_STATUS.DONE]: "Done",
  [TASK_STATUS.BLOCKED]: "Blocked",
  [TASK_STATUS.ARCHIVED]: "Archived",
};

/**
 * Valid status transitions.
 * Key = current status, Value = array of allowed next statuses.
 * Archived is a terminal state reachable from most statuses (soft-delete).
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
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
  [TASK_STATUS.ARCHIVED]: [],
};

/**
 * Available LLM models for agent configuration.
 */
export const AVAILABLE_MODELS = [
  {
    value: LLM_MODEL.CLAUDE_HAIKU_4_5,
    label: "Claude Haiku 4.5 (Recommended)",
  },
  { value: LLM_MODEL.GPT_5_NANO, label: "GPT-5 Nano" },
] as const;

/**
 * OpenClaw provider/model mapping for supported LLM identifiers.
 */
export const MODEL_TO_OPENCLAW: Record<LLMModel, string> = {
  [LLM_MODEL.CLAUDE_HAIKU_4_5]: "anthropic/claude-haiku-4.5",
  [LLM_MODEL.GPT_5_NANO]: "openai/gpt-5-nano",
};

/**
 * Fallback OpenClaw provider/model when no mapping exists.
 */
export const OPENCLAW_FALLBACK_MODEL = "anthropic/claude-haiku-4.5";

/**
 * Skill category labels for UI display.
 */
export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  [SKILL_CATEGORY.MCP_SERVER]: "MCP Server",
  [SKILL_CATEGORY.TOOL]: "Tool",
  [SKILL_CATEGORY.INTEGRATION]: "Integration",
  [SKILL_CATEGORY.CUSTOM]: "Custom",
};

// ============================================================================
// AGENT STATUS CONSTANTS
// ============================================================================

/**
 * Ordered list of agent statuses for UI display.
 */
export const AGENT_STATUS_ORDER: AgentStatus[] = [
  AGENT_STATUS.ONLINE,
  AGENT_STATUS.BUSY,
  AGENT_STATUS.IDLE,
  AGENT_STATUS.OFFLINE,
  AGENT_STATUS.ERROR,
];

/**
 * Human-readable labels for agent statuses.
 */
export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  [AGENT_STATUS.ONLINE]: "Online",
  [AGENT_STATUS.BUSY]: "Busy",
  [AGENT_STATUS.IDLE]: "Idle",
  [AGENT_STATUS.OFFLINE]: "Offline",
  [AGENT_STATUS.ERROR]: "Error",
};

/**
 * Hex colors for task status in analytics charts (not CSS variables).
 */
export const TASK_STATUS_CHART_COLORS: Record<TaskStatus, string> = {
  [TASK_STATUS.INBOX]: "#6b7280",
  [TASK_STATUS.ASSIGNED]: "#8b5cf6",
  [TASK_STATUS.IN_PROGRESS]: "#3b82f6",
  [TASK_STATUS.REVIEW]: "#f59e0b",
  [TASK_STATUS.DONE]: "#22c55e",
  [TASK_STATUS.BLOCKED]: "#ef4444",
  [TASK_STATUS.ARCHIVED]: "#9ca3af",
};

/**
 * Hex colors for agent status in analytics charts (not CSS variables).
 */
export const AGENT_STATUS_CHART_COLORS: Record<AgentStatus, string> = {
  [AGENT_STATUS.ONLINE]: "#22c55e",
  [AGENT_STATUS.BUSY]: "#f59e0b",
  [AGENT_STATUS.IDLE]: "#6b7280",
  [AGENT_STATUS.OFFLINE]: "#9ca3af",
  [AGENT_STATUS.ERROR]: "#ef4444",
};

// ============================================================================
// ANALYTICS TIME RANGE
// ============================================================================

/**
 * Time range values shown in analytics dashboard tabs (day, week, month).
 * "custom" is API-only and not in the tab list.
 */
export const ANALYTICS_TIME_RANGE_ORDER: AnalyticsTimeRange[] = [
  ANALYTICS_TIME_RANGE.DAY,
  ANALYTICS_TIME_RANGE.WEEK,
  ANALYTICS_TIME_RANGE.MONTH,
];

/**
 * Human-readable labels for analytics time range (tabs and tooltips).
 */
export const ANALYTICS_TIME_RANGE_LABELS: Record<AnalyticsTimeRange, string> = {
  [ANALYTICS_TIME_RANGE.DAY]: "Day",
  [ANALYTICS_TIME_RANGE.WEEK]: "Week",
  [ANALYTICS_TIME_RANGE.MONTH]: "Month",
  [ANALYTICS_TIME_RANGE.CUSTOM]: "Custom",
};

// ============================================================================
// ACTIVITY TYPE CONSTANTS
// ============================================================================

/**
 * Human-readable labels for activity types.
 */
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  [ACTIVITY_TYPE.ACCOUNT_CREATED]: "Account created",
  [ACTIVITY_TYPE.ACCOUNT_UPDATED]: "Account updated",
  [ACTIVITY_TYPE.TASK_CREATED]: "Task created",
  [ACTIVITY_TYPE.TASK_UPDATED]: "Task updated",
  [ACTIVITY_TYPE.TASK_STATUS_CHANGED]: "Status changed",
  [ACTIVITY_TYPE.MESSAGE_CREATED]: "Comment",
  [ACTIVITY_TYPE.DOCUMENT_CREATED]: "Document created",
  [ACTIVITY_TYPE.DOCUMENT_UPDATED]: "Document updated",
  [ACTIVITY_TYPE.DOCUMENT_DELETED]: "Document deleted",
  [ACTIVITY_TYPE.AGENT_STATUS_CHANGED]: "Agent status",
  [ACTIVITY_TYPE.RUNTIME_STATUS_CHANGED]: "Runtime status",
  [ACTIVITY_TYPE.MEMBER_ADDED]: "Member added",
  [ACTIVITY_TYPE.MEMBER_REMOVED]: "Member removed",
  [ACTIVITY_TYPE.MEMBER_UPDATED]: "Member updated",
  [ACTIVITY_TYPE.ROLE_CHANGED]: "Role changed",
  [ACTIVITY_TYPE.CONTAINER_CREATED]: "Container created",
  [ACTIVITY_TYPE.CONTAINER_DELETED]: "Container deleted",
  [ACTIVITY_TYPE.CONTAINER_RESTARTED]: "Container restarted",
  [ACTIVITY_TYPE.CONTAINER_FAILED]: "Container failed",
};

// ============================================================================
// NOTIFICATION TYPE CONSTANTS
// ============================================================================

/**
 * Human-readable labels for notification types.
 */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NOTIFICATION_TYPE.MENTION]: "Mention",
  [NOTIFICATION_TYPE.ASSIGNMENT]: "Assignment",
  [NOTIFICATION_TYPE.THREAD_UPDATE]: "Thread update",
  [NOTIFICATION_TYPE.STATUS_CHANGE]: "Status change",
  [NOTIFICATION_TYPE.RESPONSE_REQUEST]: "Response request",
  [NOTIFICATION_TYPE.MEMBER_ADDED]: "Member added",
  [NOTIFICATION_TYPE.MEMBER_REMOVED]: "Member removed",
  [NOTIFICATION_TYPE.ROLE_CHANGED]: "Role changed",
};

/**
 * Typing indicator window in ms (2 minutes).
 * Agent is considered "typing" when notification is read but not yet delivered, within this window.
 * Used by task thread and agents sidebar for consistent typing semantics.
 */
export const TYPING_WINDOW_MS = 2 * 60 * 1000;

/**
 * Default OpenClaw configuration for new agents.
 */
export const DEFAULT_OPENCLAW_CONFIG = {
  model: LLM_MODEL.CLAUDE_HAIKU_4_5,
  temperature: 0.7,
  maxTokens: 4096,
  skillIds: [],
  contextConfig: {
    maxHistoryMessages: 50,
    includeTaskContext: true,
    includeTeamContext: true,
  },
  behaviorFlags: {
    canCreateTasks: false,
    canModifyTaskStatus: true,
    canCreateDocuments: true,
    canMentionAgents: true,
  },
} as const;
