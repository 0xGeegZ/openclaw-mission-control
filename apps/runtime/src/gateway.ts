import { RuntimeConfig } from "./config";
import { getConvexClient, api } from "./convex-client";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { createLogger } from "./logger";

const log = createLogger("[Gateway]");


/**
 * Collect response text from OpenClaw content fields (string/object/array).
 */
function collectOpenClawContentText(content: unknown, parts: string[]): void {
  if (!content) return;
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed) parts.push(trimmed);
    return;
  }
  if (Array.isArray(content)) {
    for (const item of content) {
      collectOpenClawContentText(item, parts);
    }
    return;
  }
  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") {
      const trimmed = obj.text.trim();
      if (trimmed) parts.push(trimmed);
    }
    if (typeof obj.content !== "undefined") {
      collectOpenClawContentText(obj.content, parts);
    }
  }
}

/**
 * Extract agent reply text from OpenClaw /v1/responses JSON body.
 * Handles output_text, output[] content arrays, and common fallbacks.
 */
function parseOpenClawResponseBody(body: string): string | null {
  const trimmed = body?.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof data.output_text === "string" && data.output_text.trim()) {
      return data.output_text.trim();
    }
    const output = data.output;
    if (Array.isArray(output)) {
      const parts: string[] = [];
      for (const item of output) {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          if (typeof obj.content !== "undefined") {
            collectOpenClawContentText(obj.content, parts);
          }
          if (typeof obj.text === "string") {
            const text = obj.text.trim();
            if (text) parts.push(text);
          }
        }
      }
      if (parts.length > 0) return parts.join("\n").trim();
    }
    if (typeof data.text === "string" && data.text.trim()) return data.text.trim();
    if (typeof data.content !== "undefined") {
      const parts: string[] = [];
      collectOpenClawContentText(data.content, parts);
      if (parts.length > 0) return parts.join("\n").trim();
    }
    return null;
  } catch {
    return null;
  }
}

interface GatewayState {
  isRunning: boolean;
  sessions: Map<string, SessionInfo>;
  /** Base URL for OpenResponses (e.g. http://127.0.0.1:18789); empty = disabled */
  openclawGatewayUrl: string;
  /** Bearer token for gateway auth; undefined = no auth header */
  openclawGatewayToken: string | undefined;
  /** Timeout for /v1/responses requests (ms) */
  openclawRequestTimeoutMs: number;
  lastSendAt: number | null;
  lastSendError: string | null;
}

interface SessionInfo {
  sessionKey: string;
  agentId: Id<"agents">;
  lastMessage: number | null;
}

const state: GatewayState = {
  isRunning: false,
  sessions: new Map(),
  openclawGatewayUrl: "",
  openclawGatewayToken: undefined,
  openclawRequestTimeoutMs: 60000,
  lastSendAt: null,
  lastSendError: null,
};

/**
 * Initialize the OpenClaw gateway.
 * Fetches agents and registers their sessions; stores gateway URL/token for send.
 */
export async function initGateway(config: RuntimeConfig): Promise<void> {
  log.info("Initializing OpenClaw gateway...");

  state.openclawGatewayUrl = config.openclawGatewayUrl;
  state.openclawGatewayToken = config.openclawGatewayToken;
  state.openclawRequestTimeoutMs = config.openclawRequestTimeoutMs;

  const client = getConvexClient();
  const agents = await client.action(api.service.actions.listAgents, {
    accountId: config.accountId,
    serviceToken: config.serviceToken,
  });

  for (const agent of agents) {
    state.sessions.set(agent.sessionKey, {
      sessionKey: agent.sessionKey,
      agentId: agent._id,
      lastMessage: null,
    });
    log.debug("Registered session:", agent.sessionKey);
  }

  state.isRunning = true;
  log.info("Initialized with", state.sessions.size, "sessions");
}

/** Agent shape from listAgents (minimal for registration). */
export interface AgentForSession {
  _id: Id<"agents">;
  sessionKey: string;
}

/**
 * Register or update a single agent session (idempotent).
 * Used by agent sync to add new agents without restart.
 */
export function registerAgentSession(agent: AgentForSession): void {
  state.sessions.set(agent.sessionKey, {
    sessionKey: agent.sessionKey,
    agentId: agent._id,
    lastMessage: null,
  });
  log.debug("Registered session:", agent.sessionKey);
}

/**
 * Remove a session by agent id.
 * Used by agent sync when an agent is deleted in Convex.
 */
export function removeAgentSession(agentId: Id<"agents">): void {
  for (const [key, info] of state.sessions.entries()) {
    if (info.agentId === agentId) {
      state.sessions.delete(key);
      log.debug("Removed session:", key);
      return;
    }
  }
}

/**
 * Send a message to an OpenClaw session via OpenResponses HTTP API.
 * POST {openclawGatewayUrl}/v1/responses with x-openclaw-session-key and optional Bearer token.
 * Uses stream: false so the response body contains the full agent reply for write-back.
 * Throws on non-2xx or when gateway URL is disabled so delivery loop keeps notification undelivered.
 * @returns Extracted response text from the agent, or null when unavailable or empty.
 */
export async function sendToOpenClaw(
  sessionKey: string,
  message: string
): Promise<string | null> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }

  const baseUrl = state.openclawGatewayUrl?.trim();
  if (!baseUrl) {
    const err = "OpenClaw gateway URL is not set (OPENCLAW_GATEWAY_URL); cannot send to session";
    state.lastSendError = err;
    throw new Error(err);
  }

  log.debug("Sending to", sessionKey, ":", message.substring(0, 100));

  const url = `${baseUrl.replace(/\/$/, "")}/v1/responses`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-openclaw-session-key": sessionKey,
  };
  if (state.openclawGatewayToken) {
    headers["Authorization"] = `Bearer ${state.openclawGatewayToken}`;
  }
  const body = JSON.stringify({ model: "openclaw", input: message, stream: false });

  const timeoutMs = state.openclawRequestTimeoutMs;
  let res: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } catch (e) {
    const errMsg =
      e instanceof Error && e.name === "AbortError"
        ? `OpenClaw gateway request timed out after ${timeoutMs}ms`
        : e instanceof Error
          ? e.message
          : String(e);
    state.lastSendError = errMsg;
    throw new Error(`OpenClaw gateway request failed: ${errMsg}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    const errMsg = `OpenClaw gateway returned ${res.status}: ${text || res.statusText}`;
    state.lastSendError = errMsg;
    throw new Error(errMsg);
  }

  state.lastSendAt = Date.now();
  state.lastSendError = null;
  session.lastMessage = Date.now();

  const responseBody = await res.text();
  return parseOpenClawResponseBody(responseBody);
}

/**
 * Receive a response from an OpenClaw session.
 * Called by OpenClaw webhook/callback.
 */
export async function receiveFromOpenClaw(
  sessionKey: string,
  response: string,
  config: { serviceToken: string; accountId: Id<"accounts"> },
  taskId?: Id<"tasks">
): Promise<void> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }
  
  log.debug("Received from", sessionKey, ":", response.substring(0, 100));
  
  // Post response as message in Convex via service action
  const client = getConvexClient();
  
  if (taskId) {
    // Note: Types will be available after running `npx convex dev`
    await client.action(api.service.actions.createMessageFromAgent, {
      agentId: session.agentId,
      taskId,
      content: response,
      serviceToken: config.serviceToken,
      accountId: config.accountId,
    });
  }
}

/**
 * Get current gateway state (for health and diagnostics).
 */
export function getGatewayState(): GatewayState {
  return {
    isRunning: state.isRunning,
    sessions: new Map(state.sessions),
    openclawGatewayUrl: state.openclawGatewayUrl,
    openclawGatewayToken: state.openclawGatewayToken ? "[redacted]" : undefined,
    openclawRequestTimeoutMs: state.openclawRequestTimeoutMs,
    lastSendAt: state.lastSendAt,
    lastSendError: state.lastSendError,
  };
}

/**
 * Shutdown gateway gracefully.
 */
export async function shutdownGateway(): Promise<void> {
  state.isRunning = false;
  state.sessions.clear();
  
  // TODO: Graceful OpenClaw shutdown
  // clawdbot gateway stop
  
  log.info("Shutdown complete");
}
