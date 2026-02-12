/**
 * Central enum definitions for OpenClaw
 * Single source of truth for TaskStatus, Priority, AgentRole, AgentStatus, MemberRole
 * 
 * Usage:
 * - Backend: Import enum values from this file in schema definitions
 * - Frontend: Import types via `typeof` inference for TypeScript safety
 * - Runtime: Use AllValidators object for type checking
 * 
 * Note: Schema.ts uses the TASK_STATUS, AGENT_STATUSES, MEMBER_ROLES values directly
 * in v.literal() calls, keeping a single source of truth for enum values.
 */

// ============================================================================
// TASK STATUS
// ============================================================================

/**
 * Task status workflow: inbox → assigned → in_progress → review → done
 * Special state: blocked (can be entered from assigned or in_progress)
 * Terminal state: archived (soft delete with audit trail)
 */
export const TASK_STATUS = [
  'inbox',
  'assigned',
  'in_progress',
  'review',
  'done',
  'blocked',
  'archived'
] as const;

export type TaskStatus = typeof TASK_STATUS[number];

export const TaskStatusValidator = {
  status: (val: unknown): val is TaskStatus => {
    return typeof val === 'string' && TASK_STATUS.includes(val as TaskStatus);
  }
};

// ============================================================================
// PRIORITY (Numeric 1-5)
// ============================================================================

/**
 * Priority is stored as a number (1 = critical, 5 = lowest)
 * This config maps numeric priority to display labels and colors
 */
export const PRIORITY_LEVELS = [1, 2, 3, 4, 5] as const;

export type Priority = typeof PRIORITY_LEVELS[number];

export const PRIORITY_CONFIG: Record<Priority, { label: string; order: number }> = {
  1: { label: 'Critical', order: 1 },
  2: { label: 'High', order: 2 },
  3: { label: 'Medium', order: 3 },
  4: { label: 'Low', order: 4 },
  5: { label: 'Lowest', order: 5 }
} as const;

export const PriorityValidator = {
  priority: (val: unknown): val is Priority => {
    return typeof val === 'number' && PRIORITY_LEVELS.includes(val as Priority);
  }
};

// ============================================================================
// AGENT ROLE
// ============================================================================

/**
 * Standard agent roles in OpenClaw
 * Note: agents.role in schema is currently a string field (not validated).
 * This export provides the canonical role values for standardization.
 */
export const AGENT_ROLES = [
  'engineer',
  'designer',
  'qa',
  'squad-lead',
  'writer'
] as const;

export type AgentRole = typeof AGENT_ROLES[number];

export const AgentRoleValidator = {
  role: (val: unknown): val is AgentRole => {
    return typeof val === 'string' && AGENT_ROLES.includes(val as AgentRole);
  }
};

// ============================================================================
// AGENT STATUS
// ============================================================================

/**
 * Indicates the current operational state of an agent.
 */
export const AGENT_STATUSES = [
  'online',
  'busy',
  'idle',
  'offline',
  'error'
] as const;

export type AgentStatus = typeof AGENT_STATUSES[number];

export const AgentStatusValidator = {
  status: (val: unknown): val is AgentStatus => {
    return typeof val === 'string' && AGENT_STATUSES.includes(val as AgentStatus);
  }
};

// ============================================================================
// MEMBER ROLE (Team/Workspace membership)
// ============================================================================

/**
 * Defines permission levels within an account.
 */
export const MEMBER_ROLES = [
  'owner',
  'admin',
  'member'
] as const;

export type MemberRole = typeof MEMBER_ROLES[number];

export const MemberRoleValidator = {
  role: (val: unknown): val is MemberRole => {
    return typeof val === 'string' && MEMBER_ROLES.includes(val as MemberRole);
  }
};

// ============================================================================
// Export all validators for runtime type checking
// ============================================================================

export const AllValidators = {
  TaskStatus: TaskStatusValidator,
  Priority: PriorityValidator,
  AgentRole: AgentRoleValidator,
  AgentStatus: AgentStatusValidator,
  MemberRole: MemberRoleValidator
};
