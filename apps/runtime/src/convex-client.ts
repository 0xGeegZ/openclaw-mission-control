import { ConvexHttpClient } from "convex/browser";
import { api } from "@packages/backend/convex/_generated/api";
import { RuntimeConfig } from "./config";

let client: ConvexHttpClient | null = null;

/**
 * Initialize Convex HTTP client with service token authentication.
 */
export function initConvexClient(config: RuntimeConfig): ConvexHttpClient {
  client = new ConvexHttpClient(config.convexUrl);
  // Set service token for authentication
  client.setAuth(config.serviceToken);
  return client;
}

/**
 * Get the initialized Convex client.
 */
export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    throw new Error("Convex client not initialized. Call initConvexClient first.");
  }
  return client;
}

export { api };
