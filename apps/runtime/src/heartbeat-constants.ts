/**
 * Single-line response meaning "no action taken"; must not be posted to task threads.
 */
export const HEARTBEAT_OK_RESPONSE = "HEARTBEAT_OK";

const HEARTBEAT_LOADING_CONTEXT_PATTERN =
  /^Loading context for heartbeat(?:\.\.\.)?$/i;

/**
 * Detect heartbeat "no-op" responses, including known OpenClaw prelude lines.
 *
 * OpenClaw can sometimes prepend status text (for example
 * "Loading context for heartbeat...") before returning `HEARTBEAT_OK`.
 * Those variants should still be treated as a heartbeat no-op.
 */
export function isHeartbeatOkResponse(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed === HEARTBEAT_OK_RESPONSE) return true;

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return false;

  const lastLine = lines[lines.length - 1];
  if (lastLine !== HEARTBEAT_OK_RESPONSE) return false;
  if (lines.length === 1) return true;

  return lines
    .slice(0, -1)
    .every((line) => HEARTBEAT_LOADING_CONTEXT_PATTERN.test(line));
}
