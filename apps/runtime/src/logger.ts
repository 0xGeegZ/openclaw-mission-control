/**
 * Minimal structured logger with levels and secret redaction.
 * Never log SERVICE_TOKEN or OPENCLAW_GATEWAY_TOKEN values.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const REDACT_EQUALS_PATTERNS = [
  /\bSERVICE_TOKEN\s*=\s*[^\s]+/gi,
  /\bOPENCLAW_GATEWAY_TOKEN\s*=\s*[^\s]+/gi,
  /\btoken\s*=\s*[^\s]+/gi,
];

const REDACT_COLON_PATTERNS = [
  /\bSERVICE_TOKEN\b\s*:\s*"?[^"\s]+"?/gi,
  /\bOPENCLAW_GATEWAY_TOKEN\b\s*:\s*"?[^"\s]+"?/gi,
  /\bserviceToken\b\s*:\s*"?[^"\s]+"?/gi,
  /\btoken\b\s*:\s*"?[^"\s]+"?/gi,
];

function redact(msg: string): string {
  let out = msg;
  for (const re of REDACT_EQUALS_PATTERNS) {
    out = out.replace(re, (m) => m.replace(/(=\s*)[^\s]+/, "$1***"));
  }
  for (const re of REDACT_COLON_PATTERNS) {
    out = out.replace(re, (m) => m.replace(/(:\s*)"?[^"\s]+"?/, "$1\"***\""));
  }
  return out;
}

let minLevel: LogLevel = "info";

/**
 * Set minimum log level (default: info).
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Check if a level is enabled.
 */
export function isLevelEnabled(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

/**
 * Format a log argument to preserve Error details.
 */
function formatArg(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ? `${value.message}\n${value.stack}` : value.message;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function log(level: LogLevel, prefix: string, ...args: unknown[]): void {
  if (!isLevelEnabled(level)) return;
  const raw = [prefix, ...args].map(formatArg).join(" ");
  const line = redact(raw);
  switch (level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.log(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

/**
 * Create a logger with a fixed prefix (e.g. "[Health]").
 */
export function createLogger(prefix: string): {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
} {
  return {
    debug: (...args) => log("debug", prefix, ...args),
    info: (...args) => log("info", prefix, ...args),
    warn: (...args) => log("warn", prefix, ...args),
    error: (...args) => log("error", prefix, ...args),
  };
}
