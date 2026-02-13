/**
 * Account settings helpers to reduce duplication.
 * Provides type-safe accessors for common settings fields.
 */

import { Doc, Id } from "../_generated/dataModel";

/**
 * Standard account settings shape.
 */
export interface AccountSettings {
  orchestratorAgentId?: Id<"agents">;
  orchestratorChatTaskId?: Id<"tasks">;
  [key: string]: unknown;
}

/**
 * Safely extract settings from an account document.
 */
export function getAccountSettings(
  account: Doc<"accounts"> | null | undefined,
): AccountSettings {
  if (!account) {
    return {};
  }

  if (typeof account.settings !== "object" || account.settings === null) {
    return {};
  }

  return account.settings as AccountSettings;
}

/**
 * Get the orchestrator agent ID from account settings.
 */
export function getOrchestratorAgentId(
  account: Doc<"accounts"> | null | undefined,
): Id<"agents"> | undefined {
  const settings = getAccountSettings(account);
  return settings.orchestratorAgentId;
}

/**
 * Get the orchestrator chat task ID from account settings.
 */
export function getOrchestratorChatTaskId(
  account: Doc<"accounts"> | null | undefined,
): Id<"tasks"> | undefined {
  const settings = getAccountSettings(account);
  return settings.orchestratorChatTaskId;
}

/**
 * Check if an account has an orchestrator configured.
 */
export function hasOrchestrator(
  account: Doc<"accounts"> | null | undefined,
): boolean {
  return !!getOrchestratorAgentId(account);
}

/**
 * Update a specific setting on an account.
 */
export function updateSetting<K extends keyof AccountSettings>(
  settings: AccountSettings | undefined,
  key: K,
  value: AccountSettings[K],
): AccountSettings {
  return {
    ...settings,
    [key]: value,
  };
}

/**
 * Remove a setting from account settings.
 */
export function removeSetting<K extends keyof AccountSettings>(
  settings: AccountSettings | undefined,
  key: K,
): AccountSettings {
  const result = { ...settings };
  delete result[key];
  return result;
}

/**
 * Merge multiple settings updates.
 */
export function mergeSettings(
  base: AccountSettings | undefined,
  updates: Partial<AccountSettings>,
): AccountSettings {
  return {
    ...base,
    ...updates,
  };
}
