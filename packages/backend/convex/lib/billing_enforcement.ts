import { GenericQueryCtx } from "convex/server";
import { DataModel } from "../_generated/dataModel";

/**
 * Billing Plan Limits and Enforcement
 *
 * Defines resource limits for each plan tier and provides enforcement utilities.
 */

// ============================================================================
// Plan Limit Definitions
// ============================================================================

export type PlanTier = "free" | "pro" | "enterprise";

export interface PlanLimits {
  /** Maximum number of agents (-1 = unlimited) */
  agents: number;

  /** Maximum tasks per month (-1 = unlimited) */
  tasksPerMonth: number;

  /** Maximum documents per task (-1 = unlimited) */
  documentsPerTask: number;

  /** Maximum storage in GB */
  storageGB: number;

  /** Maximum members per account (-1 = unlimited) */
  members: number;

  /** Can use advanced features (custom integrations, webhooks, etc.) */
  advancedFeatures: boolean;
}

/**
 * Plan limit definitions.
 * Used to enforce resource constraints across the application.
 */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    agents: 1,
    tasksPerMonth: 10,
    documentsPerTask: 5,
    storageGB: 1,
    members: 3,
    advancedFeatures: false,
  },
  pro: {
    agents: 5,
    tasksPerMonth: -1, // unlimited
    documentsPerTask: 20,
    storageGB: 10,
    members: 10,
    advancedFeatures: false,
  },
  enterprise: {
    agents: -1, // unlimited
    tasksPerMonth: -1, // unlimited
    documentsPerTask: -1, // unlimited
    storageGB: 100,
    members: -1, // unlimited
    advancedFeatures: true,
  },
};

// ============================================================================
// Enforcement Utilities
// ============================================================================

/**
 * Get the plan limits for an account.
 */
export function getPlanLimits(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan];
}

/**
 * Check if a value exceeds a limit (-1 = unlimited).
 * Returns true if limit is exceeded.
 */
export function exceedsLimit(current: number, limit: number): boolean {
  if (limit === -1) {
    return false; // unlimited
  }
  return current >= limit;
}

/**
 * Format a limit error message with upgrade suggestion.
 */
export function formatLimitError(
  resourceType: string,
  currentPlan: PlanTier,
  limit: number,
  suggestedPlan: PlanTier = "pro",
): string {
  if (limit === -1) {
    return `Internal error: Unlimited ${resourceType} for ${currentPlan} plan.`;
  }

  return `Plan limit reached: ${currentPlan} plan allows ${limit} ${resourceType}. Upgrade to ${suggestedPlan} for ${suggestedPlan === "pro" ? "5" : "unlimited"} ${resourceType}.`;
}

/**
 * Check if an account can create an agent.
 * Throws an error if the limit is exceeded.
 */
export async function enforceAgentLimit(
  ctx: GenericQueryCtx<DataModel>,
  accountId: string,
  plan: PlanTier,
): Promise<void> {
  const limits = getPlanLimits(plan);
  if (limits.agents === -1) {
    return; // unlimited
  }

  const agentCount = await ctx.db
    .query("agents")
    .withIndex("by_account", (q) => q.eq("accountId", accountId as any))
    .collect()
    .then((agents) => agents.length);

  if (exceedsLimit(agentCount, limits.agents)) {
    throw new Error(
      formatLimitError("agents", plan, limits.agents, "pro"),
    );
  }
}

/**
 * Check if an account can create a task this month.
 * Throws an error if the limit is exceeded.
 */
export async function enforceTaskLimit(
  ctx: GenericQueryCtx<DataModel>,
  accountId: string,
  plan: PlanTier,
): Promise<void> {
  const limits = getPlanLimits(plan);
  if (limits.tasksPerMonth === -1) {
    return; // unlimited
  }

  // Get current period (YYYY-MM)
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const usageRecord = await ctx.db
    .query("usageRecords")
    .withIndex("by_account_period", (q) =>
      q.eq("accountId", accountId as any).eq("period", period),
    )
    .first();

  const taskCount = usageRecord?.tasks ?? 0;

  if (exceedsLimit(taskCount, limits.tasksPerMonth)) {
    throw new Error(
      formatLimitError("tasks per month", plan, limits.tasksPerMonth, "pro"),
    );
  }
}

/**
 * Check if an account can create a document for a task.
 * Throws an error if the limit is exceeded.
 */
export async function enforceDocumentLimit(
  ctx: GenericQueryCtx<DataModel>,
  accountId: string,
  taskId: string,
  plan: PlanTier,
): Promise<void> {
  const limits = getPlanLimits(plan);
  if (limits.documentsPerTask === -1) {
    return; // unlimited
  }

  const documentCount = await ctx.db
    .query("documents")
    .withIndex("by_task", (q) => q.eq("taskId", taskId as any))
    .collect()
    .then((docs) => docs.length);

  if (exceedsLimit(documentCount, limits.documentsPerTask)) {
    throw new Error(
      formatLimitError("documents per task", plan, limits.documentsPerTask, "pro"),
    );
  }
}

/**
 * Check if an account can add a member.
 * Throws an error if the limit is exceeded.
 */
export async function enforceMemberLimit(
  ctx: GenericQueryCtx<DataModel>,
  accountId: string,
  plan: PlanTier,
): Promise<void> {
  const limits = getPlanLimits(plan);
  if (limits.members === -1) {
    return; // unlimited
  }

  const memberCount = await ctx.db
    .query("memberships")
    .withIndex("by_account", (q) => q.eq("accountId", accountId as any))
    .collect()
    .then((members) => members.length);

  if (exceedsLimit(memberCount, limits.members)) {
    throw new Error(
      formatLimitError("members", plan, limits.members, "pro"),
    );
  }
}

/**
 * Check if an account can use advanced features.
 * Throws an error if not allowed.
 */
export function enforceAdvancedFeatures(plan: PlanTier): void {
  const limits = getPlanLimits(plan);
  if (!limits.advancedFeatures) {
    throw new Error(
      `Advanced features require Enterprise plan. Current plan: ${plan}`,
    );
  }
}

/**
 * Get current storage usage for an account in bytes.
 */
export async function getStorageUsage(
  ctx: GenericQueryCtx<DataModel>,
  accountId: string,
): Promise<number> {
  // Get current period (YYYY-MM)
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const usageRecord = await ctx.db
    .query("usageRecords")
    .withIndex("by_account_period", (q) =>
      q.eq("accountId", accountId as any).eq("period", period),
    )
    .first();

  return usageRecord?.storageBytes ?? 0;
}

/**
 * Check if an account can upload a file of given size.
 * Throws an error if storage limit is exceeded.
 */
export async function enforceStorageLimit(
  ctx: GenericQueryCtx<DataModel>,
  accountId: string,
  plan: PlanTier,
  additionalBytes: number,
): Promise<void> {
  const limits = getPlanLimits(plan);
  const limitBytes = limits.storageGB * 1024 * 1024 * 1024; // Convert GB to bytes

  const currentUsage = await getStorageUsage(ctx, accountId);
  const newUsage = currentUsage + additionalBytes;

  if (newUsage > limitBytes) {
    const currentGB = (currentUsage / (1024 * 1024 * 1024)).toFixed(2);
    const limitGB = limits.storageGB;
    throw new Error(
      `Storage limit reached: ${currentGB} GB / ${limitGB} GB used. Upgrade to ${plan === "free" ? "Pro" : "Enterprise"} for more storage.`,
    );
  }
}
