/**
 * Slash commands for the task message input (e.g. /stop).
 * Parsing and command list live here so they can be unit-tested.
 */

/** Slash commands available in the task thread message input. Used for dropdown and submit handling. */
export const SLASH_COMMANDS = [
  {
    id: "stop",
    label: "stop",
    description: "Pause all agents on this task (emergency stop)",
  },
] as const;

/** Union of slash command ids. Extend when adding new commands. */
export type SlashCommandId = (typeof SLASH_COMMANDS)[number]["id"];

/**
 * Parses trimmed input for a slash command. Caller must pass already-trimmed content.
 *
 * @param trimmed - User input after trim (e.g. from content.trim())
 * @returns Command id and optional reason, or null if not a known slash command
 */
export function parseSlashCommand(
  trimmed: string,
): { command: SlashCommandId; reason?: string } | null {
  if (typeof trimmed !== "string") return null;
  if (trimmed === "/stop" || trimmed.startsWith("/stop ")) {
    const reason = trimmed.slice("/stop".length).trim() || undefined;
    return { command: "stop", reason };
  }
  return null;
}
