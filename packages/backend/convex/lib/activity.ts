import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

import type { ActivityType, ActorType, TargetType } from "./validators";

// Re-export for backward compatibility
export type { ActivityType };

/**
 * Parameters for logging an activity.
 */
export interface LogActivityParams {
  ctx: MutationCtx;
  accountId: Id<"accounts">;
  type: ActivityType;
  actorType: ActorType;
  actorId: string;
  actorName?: string;
  targetType: TargetType;
  targetId: string;
  targetName?: string;
  meta?: Record<string, unknown>;
}

/**
 * Log an activity to the activity feed.
 * This is the full implementation (not a stub).
 * 
 * @param params - Activity parameters
 * @returns The created activity ID
 */
export async function logActivity(params: LogActivityParams): Promise<Id<"activities">> {
  const { ctx, accountId, type, actorType, actorId, actorName, targetType, targetId, targetName, meta } = params;
  
  return ctx.db.insert("activities", {
    accountId,
    type,
    actorType,
    actorId,
    actorName: actorName ?? actorId, // Use actorId as fallback if name not provided
    targetType,
    targetId,
    targetName,
    meta,
    createdAt: Date.now(),
  });
}

/** Capitalize status for display (e.g. "online" -> "Online"). */
function formatStatus(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Get human-readable description for an activity.
 * @param meta - Optional activity meta; for agent_status_changed, meta.oldStatus and meta.newStatus are used for "from X to Y".
 */
export function getActivityDescription(
  type: ActivityType,
  actorName: string,
  targetName?: string,
  meta?: Record<string, unknown>
): string {
  const target = targetName ?? "an item";

  switch (type) {
    case "account_created":
      return `${actorName} created account "${target}"`;
    case "account_updated":
      return `${actorName} updated account settings`;
    case "task_created":
      return `${actorName} created task "${target}"`;
    case "task_updated":
      return `${actorName} updated task "${target}"`;
    case "task_status_changed":
      return `${actorName} changed status of "${target}"`;
    case "message_created":
      return `${actorName} commented on "${target}"`;
    case "document_created":
      return `${actorName} created document "${target}"`;
    case "document_updated":
      return `${actorName} updated document "${target}"`;
    case "document_deleted":
      return `${actorName} deleted document "${target}"`;
    case "agent_status_changed": {
      const oldS = meta?.oldStatus as string | undefined;
      const newS = meta?.newStatus as string | undefined;
      if (oldS != null && newS != null) {
        return `status changed from ${formatStatus(oldS)} to ${formatStatus(newS)}`;
      }
      return "status changed";
    }
    case "runtime_status_changed": {
      const oldS = meta?.oldStatus as string | undefined;
      const newS = meta?.newStatus as string | undefined;
      if (oldS != null && newS != null) {
        return `status changed from ${formatStatus(oldS)} to ${formatStatus(newS)}`;
      }
      return "runtime status changed";
    }
    case "member_added":
      return `${actorName} added ${targetName ?? "a member"}`;
    case "member_removed":
      return `${actorName} removed ${targetName ?? "a member"}`;
    case "member_updated":
      return `${actorName} updated member "${target}"`;
    case "role_changed":
      return `${actorName} changed role of ${targetName ?? "a member"}`;
    default:
      return `${actorName} performed an action`;
  }
}
