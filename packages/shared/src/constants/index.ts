/**
 * Shared constants for OpenClaw Mission Control.
 *
 * NOTE: These constants must stay in sync with @packages/backend/convex/lib/constants.ts.
 * Use the same const object pattern for consistency.
 */
import {
  TASK_STATUS,
  SKILL_CATEGORY,
  LLM_MODEL,
  type TaskStatus,
  type LLMModel,
  type SkillCategory,
} from "../types";

// Re-export from types for convenience
export { TASK_STATUS, SKILL_CATEGORY, LLM_MODEL };

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
  { value: LLM_MODEL.CLAUDE_HAIKU_4_5, label: "Claude Haiku 4.5 (Recommended)" },
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
