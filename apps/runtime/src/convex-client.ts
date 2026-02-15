import { ConvexHttpClient } from "convex/browser";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { RuntimeConfig } from "./config";
import { createLogger } from "./logger";

/** Minimal shape for items returned by service.actions.listAgents (backend returns unknown[]). */
export interface ListAgentsItem {
  _id: Id<"agents">;
  sessionKey: string;
  slug?: string;
}

const log = createLogger("[Convex]");

let client: ConvexHttpClient | null = null;

/** Max attempts (initial + retries). Aligns with Convex: caller retries action calls. */
const MAX_ATTEMPTS = 4;
/** Initial backoff before first retry (ms). Exponential backoff thereafter. */
const INITIAL_BACKOFF_MS = 250;
/** Backoff multiplier per attempt (exponential). */
const BACKOFF_BASE = 2;

/**
 * Custom fetch that retries on transient network errors.
 * Per Convex docs (Error handling, Actions): "It is responsibility of the caller to
 * handle errors raised by actions and retry if appropriate."
 * ConvexHttpClient supports a custom fetch (docs.convex.dev/api/classes/browser.ConvexHttpClient).
 */
async function fetchWithRetry(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isRetryable =
        msg === "fetch failed" ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("ENOTFOUND");
      if (attempt < MAX_ATTEMPTS - 1 && isRetryable) {
        const delayMs = INITIAL_BACKOFF_MS * BACKOFF_BASE ** attempt;
        log.warn("Convex request failed, retrying", {
          attempt: attempt + 1,
          maxAttempts: MAX_ATTEMPTS,
          delayMs,
          error: msg,
          url,
        });
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      log.error("Convex request failed after all retries", {
        attempt: attempt + 1,
        maxAttempts: MAX_ATTEMPTS,
        error: msg,
        url,
      });
      throw e;
    }
  }
  throw lastError;
}

/**
 * Initialize Convex HTTP client with retry on transient network errors.
 * Uses the client's custom fetch option so all actions/queries/mutations are retried.
 */
export function initConvexClient(config: RuntimeConfig): ConvexHttpClient {
  client = new ConvexHttpClient(config.convexUrl, {
    fetch: (input, init) => fetchWithRetry(input, init),
  });
  return client;
}

/**
 * Get the initialized Convex client.
 */
export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    throw new Error(
      "Convex client not initialized. Call initConvexClient first.",
    );
  }
  return client;
}

export { api };
