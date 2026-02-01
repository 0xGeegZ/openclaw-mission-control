import { Id } from "../_generated/dataModel";
import { QueryCtx, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Context returned by service authentication.
 * Used by runtime service calls.
 */
export interface ServiceContext {
  accountId: Id<"accounts">;
  serviceId: string;
}

/**
 * Service token format:
 * mc_service_{accountId}_{randomSecret}
 * 
 * The secret portion is hashed and stored in accounts.serviceTokenHash.
 * Validation uses timing-safe comparison to prevent timing attacks.
 */

/**
 * Hash a service token secret for storage.
 * Uses Web Crypto API (SHA-256) which works in all Convex environments.
 */
async function hashServiceTokenSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify service authentication from action context.
 * Validates token format and secret against stored hash.
 * 
 * Works in both queries/mutations (with ctx.db) and actions (using internal query).
 * 
 * @param ctx - Query, mutation, or action context
 * @param serviceToken - Service token from request
 * @returns Service context with accountId
 * @throws Error if token is invalid
 */
export async function requireServiceAuth(
  ctx: QueryCtx | ActionCtx | any,
  serviceToken: string
): Promise<ServiceContext> {
  // Validate token format
  if (!serviceToken.startsWith("mc_service_")) {
    throw new Error("Invalid service token format");
  }
  
  const parts = serviceToken.split("_");
  if (parts.length < 4) {
    throw new Error("Invalid service token structure");
  }
  
  // Extract accountId and secret
  // Format: mc_service_{accountId}_{secret}
  const accountId = parts[2] as Id<"accounts">;
  const secret = parts.slice(3).join("_"); // Handle secrets that might contain underscores
  
  // Get account - use ctx.db if available (queries/mutations), otherwise use internal query (actions)
  let account;
  if ("db" in ctx && ctx.db) {
    // Query or mutation context - direct DB access
    account = await ctx.db.get(accountId);
  } else if ("runQuery" in ctx) {
    // Action context - use internal query
    account = await ctx.runQuery(internal.accounts.getInternal, {
      accountId,
    });
  } else {
    throw new Error("Invalid context: cannot access database");
  }
  
  if (!account) {
    throw new Error("Not found: Account does not exist");
  }
  
  if (!account.serviceTokenHash) {
    throw new Error("Forbidden: Account has no service token configured");
  }
  
  // Hash the provided secret and compare with stored hash
  const providedHash = await hashServiceTokenSecret(secret);
  const storedHash = account.serviceTokenHash;
  
  // Use timing-safe comparison to prevent timing attacks
  // Compare byte-by-byte to avoid timing leaks
  if (providedHash.length !== storedHash.length) {
    throw new Error("Invalid service token");
  }
  
  // Convert hex strings to Uint8Array for timing-safe comparison
  const providedBytes = new Uint8Array(providedHash.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
  const storedBytes = new Uint8Array(storedHash.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
  
  // Timing-safe comparison
  let result = 0;
  for (let i = 0; i < providedBytes.length; i++) {
    result |= providedBytes[i] ^ storedBytes[i];
  }
  
  if (result !== 0) {
    throw new Error("Invalid service token");
  }
  
  return {
    accountId,
    serviceId: serviceToken,
  };
}

/**
 * Generate a service token for an account.
 * Called when provisioning a runtime server.
 * Uses Web Crypto API for secure random generation.
 * 
 * NOTE: This must be called from an action (not query/mutation) since it's async.
 * 
 * @param accountId - Account to generate token for
 * @returns Generated service token and its hash
 */
export async function generateServiceToken(accountId: Id<"accounts">): Promise<{
  token: string;
  hash: string;
}> {
  // Generate cryptographically secure random secret (32 bytes = 64 hex chars)
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secret = Array.from(secretBytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  const token = `mc_service_${accountId}_${secret}`;
  const hash = await hashServiceTokenSecret(secret);
  
  return { token, hash };
}
