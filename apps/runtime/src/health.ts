import http from "http";
import net from "net";
import { randomUUID } from "crypto";
import { RuntimeConfig } from "./config";
import { getConvexClient, api } from "./convex-client";
import { getAgentSyncState } from "./agent-sync";
import { getDeliveryState } from "./delivery";
import { getAgentIdForSessionKey, getGatewayState } from "./gateway";
import { getHeartbeatState } from "./heartbeat";
import { createLogger } from "./logger";
import {
  checkRestartRequested,
  checkAndApplyPendingUpgrade,
} from "./self-upgrade";
import { Id } from "@packages/backend/convex/_generated/dataModel";
import {
  recordSuccess,
  recordFailure,
  getAllMetrics,
  formatPrometheusMetrics,
} from "./metrics";

const log = createLogger("[Health]");
let server: http.Server | null = null;
let runtimeConfig: RuntimeConfig | null = null;
let isShuttingDown = false;

/**
 * Read and parse JSON body from an HTTP request.
 */
async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve());
    req.on("error", (error) => reject(error));
  });
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) {
    throw new Error("Empty JSON body");
  }
  return JSON.parse(raw) as T;
}

/**
 * Send a JSON response with status and payload.
 */
function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown,
  correlationId?: string,
): void {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (correlationId) {
    headers["x-correlation-id"] = correlationId;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

/**
 * Check whether a remote address is loopback or private network.
 */
function isLocalAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;

  const ipv4Candidate = normalized.startsWith("::ffff:")
    ? normalized.slice("::ffff:".length)
    : normalized;
  const octets = parseIpv4Octets(ipv4Candidate);
  if (!octets) return false;
  return isLoopbackIpv4(octets) || isPrivateIpv4(octets);
}

/**
 * Parse a dotted IPv4 string into octets.
 */
function parseIpv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets;
}

/**
 * Check for IPv4 loopback range.
 */
function isLoopbackIpv4(octets: number[]): boolean {
  return octets[0] === 127;
}

/**
 * Check for RFC1918 private IPv4 ranges (used by Docker networks).
 */
function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Map task status update errors to HTTP status codes.
 */
function mapTaskStatusError(message: string): {
  status: number;
  message: string;
} {
  const normalized = message.toLowerCase();
  if (normalized.includes("unauthorized")) {
    return { status: 401, message };
  }
  if (normalized.includes("forbidden")) {
    return { status: 403, message };
  }
  if (normalized.includes("not found")) {
    return { status: 404, message };
  }
  if (
    normalized.includes("invalid transition") ||
    normalized.includes("invalid status change") ||
    normalized.includes("invalid status")
  ) {
    return { status: 422, message };
  }
  return { status: 500, message: "Failed to update task status" };
}

/**
 * Get or generate correlation ID for a request.
 * Reads x-correlation-id header or generates UUID if not present.
 */
function getOrGenerateCorrelationId(
  req: http.IncomingMessage
): string {
  const headerValue = req.headers["x-correlation-id"];
  if (typeof headerValue === "string") {
    return headerValue;
  }
  return randomUUID();
}

/**
 * Check gateway connectivity for readiness probe.
 * Attempts a simple TCP connection to gateway.
 */
async function checkGatewayConnectivity(config: RuntimeConfig): Promise<boolean> {
  if (!config.gatewayUrl) {
    return false;
  }

  try {
    // Parse gateway URL to get hostname and port
    const url = new URL(config.gatewayUrl);
    const hostname = url.hostname;
    const port = parseInt(url.port || (url.protocol === "https:" ? "443" : "80"), 10);

    return await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: hostname, port });
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 5000); // 5 second timeout

      socket.on("connect", () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/**
 * Start health check HTTP endpoint.
 *
 * Endpoints:
 * - GET /health - Full health status with versions
 * - GET /version - Just version info (for quick checks)
 */
export function startHealthServer(config: RuntimeConfig): void {
  runtimeConfig = config;

  server = http.createServer(async (req, res) => {
    const correlationId = getOrGenerateCorrelationId(req);

    // Version endpoint - lightweight, just returns versions
    if (req.url === "/version") {
      const versionInfo = {
        runtimeServiceVersion: config.runtimeServiceVersion,
        openclawVersion: config.openclawVersion,
        dropletId: config.dropletId,
        region: config.dropletRegion,
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(versionInfo));
      return;
    }

    // Liveness probe endpoint (Kubernetes)
    // Returns 200 OK if service is alive, 503 if shutting down
    // Does NOT check dependencies - fast response required (<100ms)
    if (req.url === "/live") {
      if (isShuttingDown) {
        sendJson(res, 503, {
          status: "dying",
          timestamp: Date.now(),
        });
      } else {
        sendJson(res, 200, {
          status: "ok",
          timestamp: Date.now(),
        });
      }
      return;
    }

    // Readiness probe endpoint (Kubernetes)
    // Returns 200 OK only when all dependencies are healthy
    // Returns 503 if any dependency fails or service is shutting down
    if (req.url === "/ready") {
      if (isShuttingDown) {
        sendJson(res, 503, {
          ready: false,
          checks: {
            gateway: false,
          },
          timestamp: Date.now(),
        });
        return;
      }

      const gateway = getGatewayState();
      const gatewayHealthy = gateway.isRunning;

      // Check actual gateway connectivity
      let gatewayConnected = gatewayHealthy;
      try {
        if (gatewayHealthy && config.gatewayUrl) {
          gatewayConnected = await checkGatewayConnectivity(config);
        }
      } catch {
        gatewayConnected = false;
      }

      const allReady = gatewayConnected;

      if (allReady) {
        sendJson(res, 200, {
          ready: true,
          checks: {
            gateway: true,
          },
          timestamp: Date.now(),
        });
      } else {
        sendJson(res, 503, {
          ready: false,
          checks: {
            gateway: gatewayConnected,
          },
          timestamp: Date.now(),
        });
      }
      return;
    }

    // Health endpoint - full status (used by fleet monitoring UI)
    if (req.url === "/health") {
      const delivery = getDeliveryState();
      const gateway = getGatewayState();
      const heartbeat = getHeartbeatState();
      const agentSync = getAgentSyncState();

      const health = {
        status:
          gateway.isRunning && delivery.isRunning ? "healthy" : "degraded",
        uptime: process.uptime(),

        versions: {
          runtimeService: config.runtimeServiceVersion,
          openclaw: config.openclawVersion,
        },

        infrastructure: {
          dropletId: config.dropletId,
          ipAddress: config.dropletIp,
          region: config.dropletRegion,
        },

        gateway: {
          running: gateway.isRunning,
          sessions: gateway.sessions.size,
          lastSendAt: gateway.lastSendAt,
          lastSendError: gateway.lastSendError,
        },
        delivery: {
          running: delivery.isRunning,
          lastDelivery: delivery.lastDelivery,
          delivered: delivery.deliveredCount,
          failed: delivery.failedCount,
          consecutiveFailures: delivery.consecutiveFailures,
          lastErrorAt: delivery.lastErrorAt,
          lastErrorMessage: delivery.lastErrorMessage,
        },
        heartbeat: {
          running: heartbeat.isRunning,
          scheduledAgents: heartbeat.scheduledCount,
        },
        agentSync: {
          running: agentSync.running,
          lastSyncAt: agentSync.lastSyncAt,
          lastError: agentSync.lastError,
          addedCount: agentSync.addedCount,
          removedCount: agentSync.removedCount,
        },
        memory: process.memoryUsage(),

        timestamp: Date.now(),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health, null, 2));
      return;
    }

    if (req.url === "/agent/task-status") {
      const requestStart = Date.now();
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" });
        res.end("Method Not Allowed");
        return;
      }

      if (!isLocalAddress(req.socket.remoteAddress)) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: endpoint is local-only",
        }, correlationId);
        return;
      }

      const sessionHeader = req.headers["x-openclaw-session-key"];
      const sessionKey = Array.isArray(sessionHeader)
        ? sessionHeader[0]
        : sessionHeader;
      if (!sessionKey) {
        log.warn("[task-status] Missing session key");
        sendJson(res, 401, {
          success: false,
          error: "Missing x-openclaw-session-key header",
        }, correlationId);
        return;
      }

      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        log.warn("[task-status] Unknown session:", sessionKey);
        sendJson(res, 401, { success: false, error: "Unknown session key" }, correlationId);
        return;
      }

      if (!runtimeConfig) {
        sendJson(res, 500, { success: false, error: "Runtime not configured" }, correlationId);
        return;
      }

      let body: { taskId?: string; status?: string; blockedReason?: string };
      try {
        body = await readJsonBody<{
          taskId?: string;
          status?: string;
          blockedReason?: string;
        }>(req);
      } catch (error) {
        log.warn("[task-status] Invalid JSON:", error);
        sendJson(res, 400, { success: false, error: "Invalid JSON body" }, correlationId);
        return;
      }

      if (
        !body ||
        typeof body.taskId !== "string" ||
        typeof body.status !== "string"
      ) {
        log.warn("[task-status] Missing fields:", body);
        sendJson(res, 400, {
          success: false,
          error: "Missing required fields: taskId, status",
        }, correlationId);
        return;
      }

      const allowedStatuses = new Set([
        "in_progress",
        "review",
        "done",
        "blocked",
      ]);
      if (!allowedStatuses.has(body.status)) {
        log.warn("[task-status] Invalid status:", body.status);
        sendJson(res, 422, {
          success: false,
          error:
            "Invalid status: must be in_progress, review, done, or blocked",
        }, correlationId);
        return;
      }

      if (body.status === "blocked" && !body.blockedReason?.trim()) {
        log.warn("[task-status] Missing blockedReason for blocked status");
        sendJson(res, 422, {
          success: false,
          error: "blockedReason is required when status is blocked",
        }, correlationId);
        return;
      }

      log.info("[task-status] Request:", {
        correlationId,
        agentId,
        taskId: body.taskId,
        status: body.status,
      });

      try {
        const client = getConvexClient();
        await client.action(api.service.actions.updateTaskStatusFromAgent, {
          accountId: runtimeConfig.accountId,
          serviceToken: runtimeConfig.serviceToken,
          agentId,
          taskId: body.taskId as Id<"tasks">,
          status: body.status as "in_progress" | "review" | "done" | "blocked",
          blockedReason: body.blockedReason,
        });
        const duration = Date.now() - requestStart;
        recordSuccess("agent.task_status", duration);
        log.info("[task-status] Success:", {
          correlationId,
          agentId,
          taskId: body.taskId,
          status: body.status,
          durationMs: duration,
        });
        sendJson(res, 200, { success: true }, correlationId);
      } catch (error) {
        const duration = Date.now() - requestStart;
        const message = error instanceof Error ? error.message : String(error);
        recordFailure("agent.task_status", duration, message);
        log.error("[task-status] Failed:", {
          correlationId,
          agentId,
          taskId: body.taskId,
          status: body.status,
          error: message,
          durationMs: duration,
        });
        const mapped = mapTaskStatusError(message);
        sendJson(res, mapped.status, { success: false, error: mapped.message }, correlationId);
      }
      return;
    }

    if (req.url === "/agent/task-create") {
      const requestStart = Date.now();
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" });
        res.end("Method Not Allowed");
        return;
      }
      if (!isLocalAddress(req.socket.remoteAddress)) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: endpoint is local-only",
        }, correlationId);
        return;
      }
      const sessionHeader = req.headers["x-openclaw-session-key"];
      const sessionKey = Array.isArray(sessionHeader)
        ? sessionHeader[0]
        : sessionHeader;
      if (!sessionKey) {
        log.warn("[task-create] Missing session key");
        sendJson(res, 401, {
          success: false,
          error: "Missing x-openclaw-session-key header",
        }, correlationId);
        return;
      }
      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        log.warn("[task-create] Unknown session:", sessionKey);
        sendJson(res, 401, { success: false, error: "Unknown session key" }, correlationId);
        return;
      }
      if (!runtimeConfig) {
        sendJson(res, 500, { success: false, error: "Runtime not configured" }, correlationId);
        return;
      }
      let body: {
        title?: string;
        description?: string;
        priority?: number;
        labels?: string[];
        status?: string;
        blockedReason?: string;
      };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch (error) {
        log.warn("[task-create] Invalid JSON:", error);
        sendJson(res, 400, { success: false, error: "Invalid JSON body" }, correlationId);
        return;
      }
      if (!body?.title?.trim()) {
        log.warn("[task-create] Missing title");
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: title",
        }, correlationId);
        return;
      }
      log.info("[task-create] Request:", {
        correlationId,
        agentId,
        title: body.title.substring(0, 50),
        status: body.status,
      });
      try {
        const client = getConvexClient();
        const { taskId } = await client.action(
          api.service.actions.createTaskFromAgent,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            title: body.title.trim(),
            description: body.description?.trim(),
            priority: body.priority,
            labels: body.labels,
            status: body.status as
              | "inbox"
              | "assigned"
              | "in_progress"
              | "review"
              | "done"
              | "blocked"
              | undefined,
            blockedReason: body.blockedReason?.trim(),
          },
        );
        const duration = Date.now() - requestStart;
        recordSuccess("agent.task_create", duration);
        log.info("[task-create] Success:", {
          correlationId,
          agentId,
          taskId,
          durationMs: duration,
        });
        sendJson(res, 200, { success: true, taskId }, correlationId);
      } catch (error) {
        const duration = Date.now() - requestStart;
        const message = error instanceof Error ? error.message : String(error);
        recordFailure("agent.task_create", duration, message);
        log.error("[task-create] Failed:", {
          correlationId,
          agentId,
          error: message,
          durationMs: duration,
        });
        sendJson(res, 403, { success: false, error: message }, correlationId);
      }
      return;
    }

    if (req.url === "/agent/task-assign") {
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" });
        res.end("Method Not Allowed");
        return;
      }
      if (!isLocalAddress(req.socket.remoteAddress)) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: endpoint is local-only",
        });
        return;
      }
      const sessionHeader = req.headers["x-openclaw-session-key"];
      const sessionKey = Array.isArray(sessionHeader)
        ? sessionHeader[0]
        : sessionHeader;
      if (!sessionKey) {
        sendJson(res, 401, {
          success: false,
          error: "Missing x-openclaw-session-key header",
        });
        return;
      }
      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        sendJson(res, 401, { success: false, error: "Unknown session key" });
        return;
      }
      if (!runtimeConfig) {
        sendJson(res, 500, { success: false, error: "Runtime not configured" });
        return;
      }
      let body: { taskId?: string; assigneeSlugs?: string[] };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.taskId?.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: taskId",
        });
        return;
      }
      const normalizedSlugs = (body.assigneeSlugs ?? [])
        .map((slug) => slug.trim().replace(/^@/, "").toLowerCase())
        .filter((slug) => slug.length > 0);
      if (normalizedSlugs.length === 0) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: assigneeSlugs",
        });
        return;
      }
      try {
        const client = getConvexClient();
        const agents = await client.action(api.service.actions.listAgents, {
          accountId: runtimeConfig.accountId,
          serviceToken: runtimeConfig.serviceToken,
        });
        const slugToId = new Map<string, string>();
        for (const agent of agents) {
          if (agent?.slug) {
            slugToId.set(String(agent.slug).toLowerCase(), String(agent._id));
          }
        }
        const assigneeIds = normalizedSlugs
          .map((slug) => slugToId.get(slug) ?? "")
          .filter(Boolean) as Id<"agents">[];
        const missing = normalizedSlugs.filter((slug) => !slugToId.get(slug));
        if (missing.length > 0) {
          sendJson(res, 422, {
            success: false,
            error: `Unknown assignee slugs: ${missing.join(", ")}`,
          });
          return;
        }
        await client.action(api.service.actions.assignTaskFromAgent, {
          accountId: runtimeConfig.accountId,
          serviceToken: runtimeConfig.serviceToken,
          agentId,
          taskId: body.taskId as Id<"tasks">,
          assignedAgentIds: assigneeIds,
        });
        sendJson(res, 200, { success: true, taskId: body.taskId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/response-request") {
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" });
        res.end("Method Not Allowed");
        return;
      }
      if (!isLocalAddress(req.socket.remoteAddress)) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: endpoint is local-only",
        });
        return;
      }
      const sessionHeader = req.headers["x-openclaw-session-key"];
      const sessionKey = Array.isArray(sessionHeader)
        ? sessionHeader[0]
        : sessionHeader;
      if (!sessionKey) {
        sendJson(res, 401, {
          success: false,
          error: "Missing x-openclaw-session-key header",
        });
        return;
      }
      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        sendJson(res, 401, { success: false, error: "Unknown session key" });
        return;
      }
      if (!runtimeConfig) {
        sendJson(res, 500, { success: false, error: "Runtime not configured" });
        return;
      }
      let body: {
        taskId?: string;
        recipientSlugs?: string[];
        message?: string;
      };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.taskId?.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: taskId",
        });
        return;
      }
      const normalizedSlugs = (body.recipientSlugs ?? [])
        .map((slug) => slug.trim().replace(/^@/, ""))
        .filter((slug) => slug.length > 0);
      if (normalizedSlugs.length === 0) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: recipientSlugs",
        });
        return;
      }
      if (!body.message?.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: message",
        });
        return;
      }
      if (normalizedSlugs.length > 10) {
        sendJson(res, 422, {
          success: false,
          error: "Too many recipients: max 10 allowed per request",
        });
        return;
      }
      if (body.message.trim().length > 1000) {
        sendJson(res, 422, {
          success: false,
          error: "Message too long: max 1000 characters allowed",
        });
        return;
      }
      try {
        const client = getConvexClient();
        const { notificationIds } = await client.action(
          api.service.actions.createResponseRequestNotifications,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            requesterAgentId: agentId,
            taskId: body.taskId as Id<"tasks">,
            recipientSlugs: normalizedSlugs,
            message: body.message.trim(),
          },
        );
        sendJson(res, 200, { success: true, notificationIds });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/document") {
      const requestStart = Date.now();
      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" });
        res.end("Method Not Allowed");
        return;
      }
      if (!isLocalAddress(req.socket.remoteAddress)) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: endpoint is local-only",
        }, correlationId);
        return;
      }
      const sessionHeader = req.headers["x-openclaw-session-key"];
      const sessionKey = Array.isArray(sessionHeader)
        ? sessionHeader[0]
        : sessionHeader;
      if (!sessionKey) {
        log.warn("[document] Missing session key");
        sendJson(res, 401, {
          success: false,
          error: "Missing x-openclaw-session-key header",
        }, correlationId);
        return;
      }
      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        log.warn("[document] Unknown session:", sessionKey);
        sendJson(res, 401, { success: false, error: "Unknown session key" }, correlationId);
        return;
      }
      if (!runtimeConfig) {
        sendJson(res, 500, { success: false, error: "Runtime not configured" }, correlationId);
        return;
      }
      const allowedTypes = ["deliverable", "note", "template", "reference"];
      let body: {
        documentId?: string;
        taskId?: string;
        title?: string;
        content?: string;
        type?: string;
      };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch (error) {
        log.warn("[document] Invalid JSON:", error);
        sendJson(res, 400, { success: false, error: "Invalid JSON body" }, correlationId);
        return;
      }
      if (
        !body?.title?.trim() ||
        body?.content == null ||
        !body?.type ||
        !allowedTypes.includes(body.type)
      ) {
        log.warn("[document] Missing/invalid fields:", {
          hasTitle: !!body?.title,
          hasContent: body?.content != null,
          type: body?.type,
        });
        sendJson(res, 400, {
          success: false,
          error:
            "Missing or invalid: title, content, and type (deliverable|note|template|reference) required",
        }, correlationId);
        return;
      }
      log.info("[document] Request:", {
        correlationId,
        agentId,
        title: body.title.substring(0, 50),
        type: body.type,
        taskId: body.taskId,
        contentLength: body.content.length,
      });
      try {
        const client = getConvexClient();
        const { documentId } = await client.action(
          api.service.actions.createDocumentFromAgent,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            documentId: body.documentId as Id<"documents"> | undefined,
            taskId: body.taskId as Id<"tasks"> | undefined,
            title: body.title.trim(),
            content: body.content,
            type: body.type as
              | "deliverable"
              | "note"
              | "template"
              | "reference",
          },
        );
        const duration = Date.now() - requestStart;
        recordSuccess("agent.document", duration);
        log.info("[document] Success:", {
          correlationId,
          agentId,
          documentId,
          durationMs: duration,
        });
        sendJson(res, 200, { success: true, documentId }, correlationId);
      } catch (error) {
        const duration = Date.now() - requestStart;
        const message = error instanceof Error ? error.message : String(error);
        recordFailure("agent.document", duration, message);
        log.error("[document] Failed:", {
          correlationId,
          agentId,
          error: message,
          durationMs: duration,
        });
        sendJson(res, 403, { success: false, error: message }, correlationId);
      }
      return;
    }

    // Metrics endpoint - Prometheus-style metrics + JSON format
    if (req.url === "/metrics") {
      const format = req.headers["accept"]?.includes("application/json")
        ? "json"
        : "prometheus";

      if (format === "json") {
        const metricsData = getAllMetrics();
        const delivery = getDeliveryState();
        const gateway = getGatewayState();
        const heartbeat = getHeartbeatState();

        const json = {
          operations: metricsData,
          runtime: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
          },
          components: {
            delivery: {
              running: delivery.isRunning,
              delivered: delivery.deliveredCount,
              failed: delivery.failedCount,
            },
            gateway: {
              running: gateway.isRunning,
              sessions: gateway.sessions.size,
            },
            heartbeat: {
              running: heartbeat.isRunning,
              scheduled: heartbeat.scheduledCount,
            },
          },
          timestamp: Date.now(),
        };
        sendJson(res, 200, json);
      } else {
        // Prometheus text format
        const prometheusText = formatPrometheusMetrics();
        res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
        res.end(prometheusText);
      }
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(config.healthPort, config.healthHost, () => {
    log.info(
      "Server listening on",
      config.healthHost + ":" + config.healthPort,
    );
    log.info(
      "Runtime Service v" + config.runtimeServiceVersion,
      "OpenClaw v" + config.openclawVersion,
    );
  });

  // Periodic health check to Convex (includes version info) and restart check
  setInterval(async () => {
    try {
      if (!runtimeConfig) return;

      const client = getConvexClient();
      await client.action(api.service.actions.updateRuntimeStatus, {
        accountId: runtimeConfig.accountId,
        status: "online",
        serviceToken: runtimeConfig.serviceToken,
        config: {
          dropletId: runtimeConfig.dropletId,
          ipAddress: runtimeConfig.dropletIp,
          region: runtimeConfig.dropletRegion,
          lastHealthCheck: Date.now(),
          openclawVersion: runtimeConfig.openclawVersion,
          runtimeServiceVersion: runtimeConfig.runtimeServiceVersion,
        },
      });

      await checkRestartRequested(runtimeConfig);
      await checkAndApplyPendingUpgrade(runtimeConfig);
    } catch (error) {
      log.error("Failed to update Convex status:", error);
    }
  }, config.healthCheckInterval);
}

/**
 * Stop health server.
 */
export function stopHealthServer(): void {
  server?.close();
  server = null;
}

/**
 * Trigger graceful shutdown mode.
 * This makes /live return 503 to signal Kubernetes to stop sending traffic.
 */
export function beginGracefulShutdown(): void {
  isShuttingDown = true;
  log.info("Graceful shutdown initiated - /live will return 503");
}
