import type { Doc } from "../_generated/dataModel";
import { DEFAULT_OPENCLAW_CONFIG } from "@packages/shared";

/** Default behavior flags; single source from shared config. Re-exported for callers that need the constant. */
export const DEFAULT_BEHAVIOR_FLAGS: BehaviorFlags = {
  ...DEFAULT_OPENCLAW_CONFIG.behaviorFlags,
  canReviewTasks: false,
  canMarkDone: false,
};

export type BehaviorFlags = {
  canCreateTasks: boolean;
  canModifyTaskStatus: boolean;
  canCreateDocuments: boolean;
  canMentionAgents: boolean;
  canReviewTasks: boolean;
  canMarkDone: boolean;
};

/**
 * Resolve effective behavior flags for an agent.
 * Fallback order: agent override → account defaults → shared default (partial merge at each level).
 */
export function resolveBehaviorFlags(
  agent: Doc<"agents"> | null,
  account: Doc<"accounts"> | null,
): BehaviorFlags {
  const accountDefaults = (
    account?.settings as
      | { agentDefaults?: { behaviorFlags?: BehaviorFlags } }
      | undefined
  )?.agentDefaults?.behaviorFlags;
  const agentFlags = agent?.openclawConfig?.behaviorFlags as
    | Partial<BehaviorFlags>
    | undefined;
  return {
    ...DEFAULT_BEHAVIOR_FLAGS,
    ...accountDefaults,
    ...agentFlags,
  };
}
