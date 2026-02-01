import { Id } from "@packages/backend/convex/_generated/dataModel";

export interface RuntimeConfig {
  /** Account ID this runtime serves */
  accountId: Id<"accounts">;
  
  /** Convex deployment URL */
  convexUrl: string;
  
  /** Service authentication token */
  serviceToken: string;
  
  /** Port for health endpoint */
  healthPort: number;
  
  /** Notification poll interval (ms) */
  deliveryInterval: number;
  
  /** Health check interval to Convex (ms) */
  healthCheckInterval: number;
  
  /** Runtime service version (from package.json or env) */
  runtimeServiceVersion: string;
  
  /** OpenClaw version (detected at startup) */
  openclawVersion: string;
  
  /** DigitalOcean droplet ID (for tracking) */
  dropletId: string;
  
  /** Droplet IP address */
  dropletIp: string;
  
  /** Droplet region */
  dropletRegion: string;
}

/**
 * Detect OpenClaw version by running `openclaw --version`.
 * Falls back to "unknown" if detection fails.
 */
async function detectOpenClawVersion(): Promise<string> {
  try {
    const { execSync } = await import("child_process");
    const output = execSync("openclaw --version", { encoding: "utf-8" });
    return output.trim();
  } catch {
    return process.env.OPENCLAW_VERSION || "unknown";
  }
}

/**
 * Get runtime service version from package.json or env.
 */
function getRuntimeServiceVersion(): string {
  return process.env.RUNTIME_VERSION || process.env.npm_package_version || "0.1.0";
}

/**
 * Load runtime configuration from environment variables.
 */
export async function loadConfig(): Promise<RuntimeConfig> {
  const accountId = process.env.ACCOUNT_ID;
  const convexUrl = process.env.CONVEX_URL;
  const serviceToken = process.env.SERVICE_TOKEN;
  
  if (!accountId || !convexUrl || !serviceToken) {
    throw new Error("Missing required environment variables: ACCOUNT_ID, CONVEX_URL, SERVICE_TOKEN");
  }
  
  const openclawVersion = await detectOpenClawVersion();
  
  return {
    accountId: accountId as Id<"accounts">,
    convexUrl,
    serviceToken,
    healthPort: parseInt(process.env.HEALTH_PORT || "3001", 10),
    deliveryInterval: parseInt(process.env.DELIVERY_INTERVAL || "5000", 10),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || "60000", 10),
    runtimeServiceVersion: getRuntimeServiceVersion(),
    openclawVersion,
    dropletId: process.env.DROPLET_ID || "unknown",
    dropletIp: process.env.DROPLET_IP || "unknown",
    dropletRegion: process.env.DROPLET_REGION || "unknown",
  };
}
