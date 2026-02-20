import type { Doc } from "../_generated/dataModel";
import { DEFAULT_OPENCLAW_CONFIG } from "@packages/shared";

/**
 * Runtime permission flags used for task workflow authorization checks.
 */
type SharedBehaviorFlags = {
  [K in keyof typeof DEFAULT_OPENCLAW_CONFIG.behaviorFlags]: boolean;
};

/**
 * Behavior flags used by backend permission resolution.
 */
export type BehaviorFlags = Pick<
  SharedBehaviorFlags,
  | "canCreateTasks"
  | "canModifyTaskStatus"
  | "canCreateDocuments"
  | "canMentionAgents"
  | "canReviewTasks"
  | "canMarkDone"
>;

/** Default behavior flags; single source from shared config. Re-exported for callers that need the constant. */
export const DEFAULT_BEHAVIOR_FLAGS: BehaviorFlags = {
  ...DEFAULT_OPENCLAW_CONFIG.behaviorFlags,
};

/**
 * Resolve effective behavior flags for an agent.
 * Fallback order: agent override → account defaults → shared default (partial merge at each level).
 */
export function resolveBehaviorFlags(
  agent: Doc<"agents"> | null,
  account: Doc<"accounts"> | null,
): BehaviorFlags {
  const accountDefaults = account?.settings?.agentDefaults?.behaviorFlags;
  const agentFlags = agent?.openclawConfig?.behaviorFlags;

  return {
    ...DEFAULT_BEHAVIOR_FLAGS,
    ...accountDefaults,
    ...agentFlags,
  };
}
