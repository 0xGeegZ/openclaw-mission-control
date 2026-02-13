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
// PLAN QUOTAS
// ============================================================================

/**
 * Subscription plan quotas for resource limits.
 * Quotas per plan tier for messages, agents, API calls, and containers.
 */
export const PLAN_QUOTAS = {
  [ACCOUNT_PLAN.FREE]: {
    messagesPerMonth: 500,
    agents: 1,
    apiCallsPerDay: 50,
    maxContainers: 1,
  },
  [ACCOUNT_PLAN.PRO]: {
    messagesPerMonth: 10000,
    agents: 10,
    apiCallsPerDay: 1000,
    maxContainers: 5,
  },
  [ACCOUNT_PLAN.ENTERPRISE]: {
    messagesPerMonth: Number.MAX_SAFE_INTEGER, // unlimited
    agents: Number.MAX_SAFE_INTEGER, // unlimited
    apiCallsPerDay: Number.MAX_SAFE_INTEGER, // unlimited
    maxContainers: 50,
  },
} as const;

// ============================================================================
// RESET CYCLES
// ============================================================================

/**
 * Time intervals (ms) for quota reset cycles.
 */
export const RESET_CYCLES = {
  MONTHLY: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  DAILY: 24 * 60 * 60 * 1000, // 24 hours in ms
} as const;
