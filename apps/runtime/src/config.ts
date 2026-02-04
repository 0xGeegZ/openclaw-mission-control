import { execSync } from "child_process";
import { Id } from "@packages/backend/convex/_generated/dataModel";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RuntimeConfig {
  /** Account ID this runtime serves */
  accountId: Id<"accounts">;
  /** Convex deployment URL */
  convexUrl: string;
  /** Service authentication token */
  serviceToken: string;
  /** Port for health endpoint */
  healthPort: number;
  /** Bind host for health server (e.g. 127.0.0.1 or 0.0.0.0) */
  healthHost: string;
  /** Notification poll interval (ms) */
  deliveryInterval: number;
  /** Health check interval to Convex (ms) */
  healthCheckInterval: number;
  /** Agent list sync interval (ms); new agents picked up without restart */
  agentSyncInterval: number;
  /** Log level */
  logLevel: LogLevel;
  /** Delivery backoff base delay (ms) */
  deliveryBackoffBaseMs: number;
  /** Delivery backoff max delay (ms) */
  deliveryBackoffMaxMs: number;
  /** Runtime service version (from package.json or env) */
  runtimeServiceVersion: string;
  /** OpenClaw version (detected at startup or env) */
  openclawVersion: string;
  /** DigitalOcean droplet ID (for tracking) */
  dropletId: string;
  /** Droplet IP address */
  dropletIp: string;
  /** Droplet region */
  dropletRegion: string;
  /** OpenClaw gateway base URL for OpenResponses (e.g. http://127.0.0.1:18789); empty = disabled */
  openclawGatewayUrl: string;
  /** OpenClaw gateway auth token (Bearer); optional for local gateway URLs (empty = no auth) */
  openclawGatewayToken: string | undefined;
  /** Timeout for OpenClaw /v1/responses requests (ms); default 60000 for long agent runs */
  openclawRequestTimeoutMs: number;
}

/**
 * Normalize env values by trimming whitespace and stripping surrounding quotes.
 */
function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Execute a version command quietly (no stderr noise).
 */
function execVersionCommand(command: string): string {
  return execSync(command, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * Detect OpenClaw version. Uses OPENCLAW_VERSION if set; otherwise runs
 * openclaw --version (or clawdbot --version). Falls back to "unknown" if detection fails.
 */
async function detectOpenClawVersion(): Promise<string> {
  const fromEnv = process.env.OPENCLAW_VERSION;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    try {
      return execVersionCommand("clawdbot --version") || "unknown";
    } catch {
      return execVersionCommand("openclaw --version") || "unknown";
    }
  } catch {
    return "unknown";
  }
}

/**
 * Get runtime service version from package.json or env.
 */
function getRuntimeServiceVersion(): string {
  return (
    process.env.RUNTIME_VERSION || process.env.npm_package_version || "0.1.0"
  );
}

/**
 * Parse an integer from env with a fallback when invalid.
 */
function parseIntOrDefault(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = parseInt(value || "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Load runtime configuration from environment variables.
 */
export async function loadConfig(): Promise<RuntimeConfig> {
  const accountId = normalizeEnvValue(process.env.ACCOUNT_ID);
  const convexUrl = normalizeEnvValue(process.env.CONVEX_URL);
  const serviceToken = normalizeEnvValue(process.env.SERVICE_TOKEN);

  if (!accountId || !convexUrl || !serviceToken) {
    throw new Error(
      "Missing required environment variables: ACCOUNT_ID, CONVEX_URL, SERVICE_TOKEN",
    );
  }

  if (!serviceToken.startsWith("mc_service_")) {
    throw new Error(
      "Invalid SERVICE_TOKEN format. Expected a token starting with mc_service_.",
    );
  }

  const tokenParts = serviceToken.split("_");
  if (tokenParts.length < 4) {
    throw new Error(
      "Invalid SERVICE_TOKEN structure. Expected mc_service_{accountId}_{secret}.",
    );
  }

  const tokenAccountId = tokenParts[2];
  if (tokenAccountId !== accountId) {
    throw new Error(
      `SERVICE_TOKEN account mismatch. Token is for ${tokenAccountId}, but ACCOUNT_ID is ${accountId}.`,
    );
  }

  const openclawVersion = await detectOpenClawVersion();
  const logLevelRaw = (process.env.LOG_LEVEL || "info").toLowerCase();
  const logLevel: LogLevel =
    logLevelRaw === "debug" ||
    logLevelRaw === "info" ||
    logLevelRaw === "warn" ||
    logLevelRaw === "error"
      ? logLevelRaw
      : "info";

  const openclawGatewayUrl = parseOpenClawGatewayUrl();
  const openclawGatewayToken = resolveOpenClawGatewayToken(
    openclawGatewayUrl,
    parseOpenClawGatewayToken(),
  );

  return {
    accountId: accountId as Id<"accounts">,
    convexUrl,
    serviceToken,
    healthPort: parseIntOrDefault(process.env.HEALTH_PORT, 3001),
    healthHost: process.env.HEALTH_HOST || "127.0.0.1",
    deliveryInterval: parseIntOrDefault(process.env.DELIVERY_INTERVAL, 5000),
    healthCheckInterval: parseIntOrDefault(
      process.env.HEALTH_CHECK_INTERVAL,
      60000,
    ),
    agentSyncInterval: parseIntOrDefault(
      process.env.AGENT_SYNC_INTERVAL,
      60000,
    ),
    logLevel,
    deliveryBackoffBaseMs: parseIntOrDefault(
      process.env.DELIVERY_BACKOFF_BASE_MS,
      5000,
    ),
    deliveryBackoffMaxMs: parseIntOrDefault(
      process.env.DELIVERY_BACKOFF_MAX_MS,
      300000,
    ),
    runtimeServiceVersion: getRuntimeServiceVersion(),
    openclawVersion,
    dropletId: process.env.DROPLET_ID || "unknown",
    dropletIp: process.env.DROPLET_IP || "unknown",
    dropletRegion: process.env.DROPLET_REGION || "unknown",
    openclawGatewayUrl,
    openclawGatewayToken,
    openclawRequestTimeoutMs: parseIntOrDefault(
      process.env.OPENCLAW_REQUEST_TIMEOUT_MS,
      180000,
    ),
  };
}

/**
 * Parse OpenClaw gateway URL from env. Defaults to local host when unset;
 * empty string disables the gateway (send will fail with descriptive error).
 */
function parseOpenClawGatewayUrl(): string {
  const raw = normalizeEnvValue(process.env.OPENCLAW_GATEWAY_URL);
  if (raw === undefined || raw === null) return "http://127.0.0.1:18789";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    new URL(trimmed);
  } catch {
    throw new Error(
      "Invalid OPENCLAW_GATEWAY_URL. Expected a valid URL like http://127.0.0.1:18789.",
    );
  }
  return trimmed;
}

/**
 * Parse OpenClaw gateway token from OPENCLAW_GATEWAY_TOKEN.
 * Undefined means env var unset or blank; callers may apply defaults.
 */
function parseOpenClawGatewayToken(): string | undefined {
  if (process.env.OPENCLAW_GATEWAY_TOKEN === undefined) return undefined;
  const v = normalizeEnvValue(process.env.OPENCLAW_GATEWAY_TOKEN);
  if (v === undefined) return undefined;
  if (!v.trim()) return "";
  return v.trim();
}

/**
 * Resolve gateway token defaults based on URL safety.
 * Local gateway URLs allow no auth; non-local URLs require a token.
 */
function resolveOpenClawGatewayToken(
  gatewayUrl: string,
  token: string | undefined,
): string | undefined {
  if (token !== undefined) return token;
  if (!gatewayUrl) return undefined;
  const host = getGatewayHost(gatewayUrl);
  if (!host) return undefined;
  if (isLocalGatewayHost(host)) return "local";
  throw new Error(
    "OPENCLAW_GATEWAY_TOKEN is required for non-local OPENCLAW_GATEWAY_URL.",
  );
}

/**
 * Extract the hostname from a gateway URL, or null when invalid.
 */
function getGatewayHost(gatewayUrl: string): string | null {
  if (!gatewayUrl) return null;
  try {
    return new URL(gatewayUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Determine if the gateway host is local for safe default token usage.
 */
function isLocalGatewayHost(host: string): boolean {
  const localHosts = new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "openclaw-gateway",
  ]);
  return localHosts.has(host);
}
