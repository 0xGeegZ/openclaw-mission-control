/**
 * Convex backend constants.
 * Shared enums are sourced from @packages/shared. Backend-only enums remain local.
 *
 * Pattern:
 * 1. Import shared constants from @packages/shared
 * 2. Define backend-only constants locally
 * 2. Validators in validators.ts use v.literal(CONSTANT.VALUE)
 * 3. Types inferred from validators using Infer<typeof validator>
 */
import {
  TASK_STATUS,
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_TRANSITIONS,
  AGENT_STATUS,
  ANALYTICS_TIME_RANGE,
  MEMBER_ROLE,
  RECIPIENT_TYPE,
  DOCUMENT_TYPE,
  NOTIFICATION_TYPE,
  ACTIVITY_TYPE,
  SKILL_CATEGORY,
  RUNTIME_STATUS,
  RUNTIME_V2_STATUS,
} from "@packages/shared";

export {
  TASK_STATUS,
  TASK_STATUS_ORDER,
  TASK_STATUS_LABELS,
  TASK_STATUS_TRANSITIONS,
  AGENT_STATUS,
  ANALYTICS_TIME_RANGE,
  MEMBER_ROLE,
  RECIPIENT_TYPE,
  DOCUMENT_TYPE,
  NOTIFICATION_TYPE,
  ACTIVITY_TYPE,
  SKILL_CATEGORY,
  RUNTIME_STATUS,
  RUNTIME_V2_STATUS,
};

// ============================================================================
// TASK STATUS
// ============================================================================

/**
 * Statuses from which /stop can move the task to blocked (emergency pause).
 */
export const PAUSE_ALLOWED_STATUSES = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.REVIEW,
] as const;

// ============================================================================
// DOCUMENT TYPE & KIND
// ============================================================================

/**
 * Document kind (file vs folder in tree).
 */
export const DOCUMENT_KIND = {
  FILE: "file",
  FOLDER: "folder",
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

// ============================================================================
// TASK COMPLEXITY
// ============================================================================

/**
 * Task complexity levels for auto-mode agent/model routing.
 */
export const TASK_COMPLEXITY = {
  EASY: "easy",
  MEDIUM: "medium",
  COMPLEX: "complex",
  HARD: "hard",
} as const;

/**
 * Task complexity type.
 */
export type TaskComplexity =
  (typeof TASK_COMPLEXITY)[keyof typeof TASK_COMPLEXITY];

// ============================================================================
// AUTO MODE ROUTING CONFIG
// ============================================================================

/**
 * Agent routing by complexity level.
 * Maps complexity to recommended agent roles.
 */
export const AGENT_COMPLEXITY_ROUTING: Record<
  TaskComplexity,
  readonly [string, string]
> = {
  [TASK_COMPLEXITY.EASY]: ["writer", "designer"],
  [TASK_COMPLEXITY.MEDIUM]: ["engineer", "writer"],
  [TASK_COMPLEXITY.COMPLEX]: ["engineer", "engineer-2"],
  [TASK_COMPLEXITY.HARD]: ["engineer-2", "squad-lead"],
} as const;

/**
 * Model routing by complexity level (cost-tiered).
 * Maps complexity to recommended models.
 */
export const MODEL_COMPLEXITY_ROUTING: Record<
  TaskComplexity,
  readonly [string, string]
> = {
  [TASK_COMPLEXITY.EASY]: ["gpt-5-nano", "gpt-5-nano"],
  [TASK_COMPLEXITY.MEDIUM]: ["minimax-m2.5", "claude-haiku-4-5"],
  [TASK_COMPLEXITY.COMPLEX]: ["kimi-k2.5", "claude-haiku-4-5"],
  [TASK_COMPLEXITY.HARD]: ["kimi-k2.5", "kimi-k2.5"],
} as const;
