import net from "node:net";
import { RuntimeConfig } from "./config";
import { getConvexClient, api } from "./convex-client";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import { createLogger } from "./logger";
import { isHeartbeatOkResponse } from "./heartbeat-constants";

const log = createLogger("[Gateway]");

/** OpenResponses function_call output item from the agent response */
export interface OpenClawToolCall {
  call_id: string;
  name: string;
  arguments: string;
}

/** Result of sendToOpenClaw: text reply and/or tool calls to execute */
export interface SendToOpenClawResult {
  text: string | null;
  toolCalls: OpenClawToolCall[];
}

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
 * Check whether a response body likely contains JSON data.
 */
function isLikelyJsonPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const firstChar = trimmed.charAt(0);
  return firstChar === "{" || firstChar === "[";
}

/**
 * Parse OpenClaw /v1/responses JSON body into text and function_call items.
 * Handles output_text, output[] (message + function_call), and fallbacks.
 */
function parseOpenClawResponseBody(body: string): SendToOpenClawResult {
  const empty: SendToOpenClawResult = { text: null, toolCalls: [] };
  const trimmed = body?.trim();
  if (!trimmed) return empty;
  if (!isLikelyJsonPayload(trimmed)) {
    return { text: trimmed, toolCalls: [] };
  }
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    const toolCalls: OpenClawToolCall[] = [];
    let text: string | null = null;

    if (typeof data.output_text === "string" && data.output_text.trim()) {
      text = data.output_text.trim();
    }
    const output = data.output;
    if (Array.isArray(output)) {
      const parts: string[] = [];
      for (const item of output) {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          if (obj.type === "function_call") {
            const callId =
              typeof obj.call_id === "string" ? obj.call_id : undefined;
            const name = typeof obj.name === "string" ? obj.name : undefined;
            const args =
              typeof obj.arguments === "string"
                ? obj.arguments
                : typeof obj.arguments === "object" && obj.arguments !== null
                  ? JSON.stringify(obj.arguments)
                  : "";
            if (callId && name) {
              toolCalls.push({ call_id: callId, name, arguments: args ?? "" });
            }
            continue;
          }
          if (typeof obj.content !== "undefined") {
            collectOpenClawContentText(obj.content, parts);
          }
          if (typeof obj.text === "string") {
            const t = (obj.text as string).trim();
            if (t) parts.push(t);
          }
        }
      }
      if (parts.length > 0 && text === null) {
        text = parts.join("\n").trim();
      }
    }
    if (text === null && typeof data.text === "string" && data.text.trim()) {
      text = (data.text as string).trim();
    }
    if (text === null && typeof data.content !== "undefined") {
      const parts: string[] = [];
      collectOpenClawContentText(data.content, parts);
      if (parts.length > 0) text = parts.join("\n").trim();
    }
    return { text, toolCalls };
  } catch {
    return { text: trimmed, toolCalls: [] };
  }
}

const DEFAULT_GATEWAY_READY_TIMEOUT_MS = 30000;
const DEFAULT_GATEWAY_READY_INTERVAL_MS = 1000;
const DEFAULT_GATEWAY_CONNECT_TIMEOUT_MS = 1000;
const NO_RESPONSE_FROM_OPENCLAW_MESSAGE = "No response from OpenClaw.";
const NO_RESPONSE_MENTION_PREFIX_PATTERN =
  /^(@[A-Za-z0-9_-]+)(\s+@[A-Za-z0-9_-]+)*$/;
const NO_RESPONSE_FALLBACK_MESSAGE = [
  "**Summary**",
  "- OpenClaw did not return a response for this run.",
  "",
  "**Work done**",
  "- None (no output received).",
  "",
  "**Next step (one)**",
  "- Retry once the runtime or gateway is healthy; check OpenClaw logs if this persists.",
  "",
  "**Sources**",
  "- None.",
].join("\n");

interface GatewayAddress {
  host: string;
  port: number;
}

/**
 * Resolve the OpenClaw gateway host/port from a base URL.
 */
function resolveGatewayAddress(baseUrl: string): GatewayAddress | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    const port = url.port
      ? Number.parseInt(url.port, 10)
      : url.protocol === "https:"
        ? 443
        : 80;
    if (!Number.isFinite(port)) return null;
    return { host: url.hostname, port };
  } catch {
    return null;
  }
}

/**
 * Resolve the OpenClaw agent id from a session key.
 * Falls back to "main" when the key is not in agent:<id>:<...> form.
 */
function resolveAgentIdFromSessionKey(sessionKey: string): string {
  const trimmed = sessionKey?.trim();
  if (!trimmed) return "main";
  const parts = trimmed.split(":");
  if (parts.length >= 2 && parts[0] === "agent" && parts[1]) {
    return parts[1];
  }
  return "main";
}

/**
 * Sleep for the given duration (ms).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt a TCP connection to the gateway host/port.
 */
function canConnect(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };
    const onFailure = () => {
      cleanup();
      resolve(false);
    };
    socket.setTimeout(timeoutMs);
    socket.once("error", onFailure);
    socket.once("timeout", onFailure);
    socket.once("connect", () => {
      cleanup();
      resolve(true);
    });
  });
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
  openclawRequestTimeoutMs: 300000,
  lastSendAt: null,
  lastSendError: null,
};

/**
 * Detect OpenClaw "no response" placeholder messages, including mention-only prefixes.
 */
export function parseNoResponsePlaceholder(response: string): {
  isPlaceholder: boolean;
  mentionPrefix: string | null;
} {
  const trimmed = response.trim();
  if (!trimmed) return { isPlaceholder: false, mentionPrefix: null };
  if (trimmed === NO_RESPONSE_FROM_OPENCLAW_MESSAGE) {
    return { isPlaceholder: true, mentionPrefix: null };
  }
  if (!trimmed.endsWith(NO_RESPONSE_FROM_OPENCLAW_MESSAGE)) {
    return { isPlaceholder: false, mentionPrefix: null };
  }
  const prefix = trimmed
    .slice(0, trimmed.length - NO_RESPONSE_FROM_OPENCLAW_MESSAGE.length)
    .trim();
  if (!prefix) return { isPlaceholder: true, mentionPrefix: null };
  if (NO_RESPONSE_MENTION_PREFIX_PATTERN.test(prefix)) {
    return { isPlaceholder: true, mentionPrefix: prefix };
  }
  return { isPlaceholder: false, mentionPrefix: null };
}

/**
 * Build a fallback response for placeholder OpenClaw messages.
 */
export function buildNoResponseFallbackMessage(
  mentionPrefix?: string | null,
): string {
  const prefix = mentionPrefix ? `${mentionPrefix.trim()}\n\n` : "";
  return `${prefix}${NO_RESPONSE_FALLBACK_MESSAGE}`;
}

/**
 * Detect fallback messages generated for no-response OpenClaw runs.
 * Accepts plain fallback and mention-prefixed variants.
 */
export function isNoResponseFallbackMessage(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (trimmed === NO_RESPONSE_FALLBACK_MESSAGE) return true;
  if (!trimmed.endsWith(NO_RESPONSE_FALLBACK_MESSAGE)) return false;
  const prefix = trimmed
    .slice(0, trimmed.length - NO_RESPONSE_FALLBACK_MESSAGE.length)
    .trim();
  return !prefix || NO_RESPONSE_MENTION_PREFIX_PATTERN.test(prefix);
}

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

/**
 * Wait for the OpenClaw gateway port to accept TCP connections.
 * Returns true once reachable, or false after timeout.
 */
export async function waitForOpenClawGatewayReady(
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const baseUrl = state.openclawGatewayUrl?.trim();
  if (!baseUrl) return true;

  const address = resolveGatewayAddress(baseUrl);
  if (!address) {
    log.warn(
      "Unable to resolve OpenClaw gateway host/port for readiness check",
    );
    return false;
  }

  const timeoutMs = Math.max(
    0,
    options.timeoutMs ?? DEFAULT_GATEWAY_READY_TIMEOUT_MS,
  );
  const intervalMs = Math.max(
    200,
    options.intervalMs ?? DEFAULT_GATEWAY_READY_INTERVAL_MS,
  );
  const deadline = Date.now() + timeoutMs;

  log.info(
    "Waiting for OpenClaw gateway on",
    `${address.host}:${address.port}`,
  );

  while (Date.now() <= deadline) {
    const reachable = await canConnect(
      address.host,
      address.port,
      DEFAULT_GATEWAY_CONNECT_TIMEOUT_MS,
    );
    if (reachable) {
      log.info("OpenClaw gateway is reachable");
      return true;
    }
    if (Date.now() >= deadline) break;
    await sleep(intervalMs);
  }

  log.warn(
    "OpenClaw gateway not reachable after",
    `${timeoutMs}ms; continuing startup`,
  );
  return false;
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
 * Resolve an agent id for a given OpenClaw session key.
 */
export function getAgentIdForSessionKey(
  sessionKey: string,
): Id<"agents"> | null {
  const session = state.sessions.get(sessionKey);
  return session ? session.agentId : null;
}

/** Options for sendToOpenClaw when tools are enabled */
export interface SendToOpenClawOptions {
  /** OpenResponses tools array (e.g. task_status); only sent when task exists and agent can modify status */
  tools?: unknown[];
  /** tool_choice: "auto" | "required" | { type: "function", name: string } */
  toolChoice?: "auto" | "required" | { type: "function"; name: string };
}

/**
 * Send a message to an OpenClaw session via OpenResponses HTTP API.
 * POST {openclawGatewayUrl}/v1/responses with x-openclaw-session-key and optional Bearer token.
 * Uses stream: false so the response body contains the full agent reply and any tool calls.
 * Throws on non-2xx or when gateway URL is disabled so delivery loop keeps notification undelivered.
 *
 * Session key and tools: The gateway must run this request in the session identified by
 * x-openclaw-session-key (e.g. agent:engineer:{accountId}) so that per-request tools (task_status,
 * task_update, task_create, document_upsert) are applied to that run. If the gateway runs the request under a
 * different session (e.g. main or openresponses:uuid), the model will not see our tools and will
 * report "tool not in function set". See docs/runtime/AGENTS.md and OpenClaw session routing.
 *
 * @returns Structured result with extracted text and any function_call items.
 */
export async function sendToOpenClaw(
  sessionKey: string,
  message: string,
  options?: SendToOpenClawOptions,
): Promise<SendToOpenClawResult> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }

  const baseUrl = state.openclawGatewayUrl?.trim();
  if (!baseUrl) {
    const err =
      "OpenClaw gateway URL is not set (OPENCLAW_GATEWAY_URL); cannot send to session";
    state.lastSendError = err;
    throw new Error(err);
  }

  log.debug("Sending to", sessionKey, ":", message.substring(0, 100));

  const agentId = resolveAgentIdFromSessionKey(sessionKey);
  const url = `${baseUrl.replace(/\/$/, "")}/v1/responses`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-openclaw-session-key": sessionKey,
    "x-openclaw-agent-id": agentId,
  };
  if (state.openclawGatewayToken) {
    headers["Authorization"] = `Bearer ${state.openclawGatewayToken}`;
  }
  const payload: Record<string, unknown> = {
    model: `openclaw:${agentId}`,
    input: message,
    stream: false,
    // OpenResponses session routing: "user" lets the gateway derive a stable session key
    // so the run uses this session (and receives per-request tools). Without it, the
    // endpoint is stateless per request and generates a new session (e.g. openresponses:uuid).
    user: sessionKey,
  };
  if (
    options?.tools &&
    Array.isArray(options.tools) &&
    options.tools.length > 0
  ) {
    payload.tools = options.tools;
    payload.tool_choice =
      options.toolChoice !== undefined ? options.toolChoice : "auto";
  }
  const body = JSON.stringify(payload);

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
 * Send function_call_output back to OpenClaw and return the final agent reply.
 * Used after executing a tool (e.g. task_status) so the agent can emit its closing message.
 */
export async function sendOpenClawToolResults(
  sessionKey: string,
  outputs: { call_id: string; output: string }[],
): Promise<string | null> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }

  const baseUrl = state.openclawGatewayUrl?.trim();
  if (!baseUrl) {
    throw new Error(
      "OpenClaw gateway URL is not set; cannot send tool results",
    );
  }

  const agentId = resolveAgentIdFromSessionKey(sessionKey);
  const url = `${baseUrl.replace(/\/$/, "")}/v1/responses`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-openclaw-session-key": sessionKey,
    "x-openclaw-agent-id": agentId,
  };
  if (state.openclawGatewayToken) {
    headers["Authorization"] = `Bearer ${state.openclawGatewayToken}`;
  }
  const body = JSON.stringify({
    model: `openclaw:${agentId}`,
    stream: false,
    user: sessionKey,
    function_call_output: outputs,
  });

  const timeoutMs = state.openclawRequestTimeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenClaw gateway (tool result) returned ${res.status}: ${text || res.statusText}`,
    );
  }

  const responseBody = await res.text();
  const parsed = parseOpenClawResponseBody(responseBody);
  return parsed.text;
}

/**
 * Receive a response from an OpenClaw session.
 * Called by OpenClaw webhook/callback.
 */
export async function receiveFromOpenClaw(
  sessionKey: string,
  response: string,
  config: { serviceToken: string; accountId: Id<"accounts"> },
  taskId?: Id<"tasks">,
): Promise<void> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }

  const trimmedResponse = response.trim();
  if (!trimmedResponse) {
    log.warn("OpenClaw returned empty response; skipping message", sessionKey);
    return;
  }
  if (isHeartbeatOkResponse(trimmedResponse)) {
    log.debug(
      "OpenClaw returned HEARTBEAT_OK; not posting to thread",
      sessionKey,
    );
    return;
  }

  log.debug(
    "Received from",
    sessionKey,
    ":",
    trimmedResponse.substring(0, 100),
  );

  const placeholder = parseNoResponsePlaceholder(response);
  let messageContent = response;
  if (placeholder.isPlaceholder) {
    log.warn(
      "OpenClaw placeholder response received; replacing with fallback message",
      sessionKey,
      taskId ?? "no-task",
    );
    messageContent = buildNoResponseFallbackMessage(placeholder.mentionPrefix);
  }

  // Post response as message in Convex via service action
  const client = getConvexClient();

  if (taskId) {
    /** Prevent agent reply loops when OpenClaw returns a placeholder. */
    const suppressAgentNotifications = placeholder.isPlaceholder;
    // Note: Types will be available after running `npx convex dev`
    await client.action(api.service.actions.createMessageFromAgent, {
      agentId: session.agentId,
      taskId,
      content: messageContent,
      serviceToken: config.serviceToken,
      accountId: config.accountId,
      suppressAgentNotifications,
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
