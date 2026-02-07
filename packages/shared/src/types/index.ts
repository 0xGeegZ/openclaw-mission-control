/**
 * Task status values for Kanban workflow.
 * Canonical states: inbox → assigned → in_progress → review → done
 * Special state: blocked (can be entered from assigned or in_progress)
 */
export type TaskStatus =
  | "inbox"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

/**
 * Agent status indicating current operational state.
 */
export type AgentStatus = "online" | "busy" | "idle" | "offline" | "error";

/**
 * User roles within an account.
 */
export type MemberRole = "owner" | "admin" | "member";

/**
 * Recipient type for notifications.
 */
export type RecipientType = "user" | "agent";

/**
 * Activity types for audit trail.
 */
export type ActivityType =
  | "task_created"
  | "task_updated"
  | "task_status_changed"
  | "message_created"
  | "document_created"
  | "document_updated"
  | "agent_status_changed"
  | "runtime_status_changed"
  | "member_added"
  | "member_removed"
  | "member_updated";

/**
 * Document types.
 */
export type DocumentType = "deliverable" | "note" | "template" | "reference";

/**
 * Notification types.
 */
export type NotificationType =
  | "mention"
  | "assignment"
  | "thread_update"
  | "status_change"
  | "member_added"
  | "member_removed"
  | "role_changed";

/**
 * Skill category types.
 * Defines what kind of capability the skill provides.
 */
export type SkillCategory =
  | "mcp_server" // External MCP server integration
  | "tool" // Built-in tool capability
  | "integration" // Third-party service integration
  | "custom"; // Custom skill definition

/**
 * Available LLM models for OpenClaw.
 */
export type LLMModel = "claude-haiku-4.5" | "gpt-5-nano";

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
