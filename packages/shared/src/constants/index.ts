import type { TaskStatus } from "../types";

/**
 * Ordered list of task statuses for Kanban columns.
 */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "done",
];

/**
 * Human-readable labels for task statuses.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

/**
 * Valid status transitions.
 * Key = current status, Value = array of allowed next statuses.
 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  inbox: ["assigned"],
  assigned: ["in_progress", "blocked"],
  in_progress: ["review", "blocked"],
  review: ["done", "in_progress"],
  done: [],
  blocked: ["assigned", "in_progress"],
};

/**
 * Available LLM models for agent configuration.
 */
export const AVAILABLE_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Recommended)" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
] as const;

/**
 * Skill category labels for UI display.
 */
export const SKILL_CATEGORY_LABELS = {
  mcp_server: "MCP Server",
  tool: "Tool",
  integration: "Integration",
  custom: "Custom",
} as const;

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
  model: "claude-sonnet-4-20250514",
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
