import { ConvexHttpClient } from "convex/browser";
import { api } from "@packages/backend/convex/_generated/api";
import { RuntimeConfig } from "./config";

let client: ConvexHttpClient | null = null;

/**
 * Initialize Convex HTTP client.
 * Service auth is passed as explicit args to service actions.
 */
export function initConvexClient(config: RuntimeConfig): ConvexHttpClient {
  client = new ConvexHttpClient(config.convexUrl);
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
