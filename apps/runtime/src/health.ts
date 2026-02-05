import http from "http";
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

const log = createLogger("[Health]");
let server: http.Server | null = null;
let runtimeConfig: RuntimeConfig | null = null;

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
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

/**
 * Check whether a remote address is loopback/local-only.
 */
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
 * Start health check HTTP endpoint.
 *
 * Endpoints:
 * - GET /health - Full health status with versions
 * - GET /version - Just version info (for quick checks)
 */
export function startHealthServer(config: RuntimeConfig): void {
  runtimeConfig = config;

  server = http.createServer(async (req, res) => {
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

      let body: { taskId?: string; status?: string; blockedReason?: string };
      try {
        body = await readJsonBody<{
          taskId?: string;
          status?: string;
          blockedReason?: string;
        }>(req);
      } catch (error) {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }

      if (
        !body ||
        typeof body.taskId !== "string" ||
        typeof body.status !== "string"
      ) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required fields: taskId, status",
        });
        return;
      }

      const allowedStatuses = new Set([
        "in_progress",
        "review",
        "done",
        "blocked",
      ]);
      if (!allowedStatuses.has(body.status)) {
        sendJson(res, 422, {
          success: false,
          error:
            "Invalid status: must be in_progress, review, done, or blocked",
        });
        return;
      }

      if (body.status === "blocked" && !body.blockedReason?.trim()) {
        sendJson(res, 422, {
          success: false,
          error: "blockedReason is required when status is blocked",
        });
        return;
      }

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
        sendJson(res, 200, { success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const mapped = mapTaskStatusError(message);
        sendJson(res, mapped.status, { success: false, error: mapped.message });
      }
      return;
    }

    if (req.url === "/agent/task-create") {
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
        title?: string;
        description?: string;
        priority?: number;
        labels?: string[];
        status?: string;
        blockedReason?: string;
      };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.title?.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: title",
        });
        return;
      }
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
        sendJson(res, 200, { success: true, taskId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/document") {
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
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (
        !body?.title?.trim() ||
        body?.content == null ||
        !body?.type ||
        !allowedTypes.includes(body.type)
      ) {
        sendJson(res, 400, {
          success: false,
          error:
            "Missing or invalid: title, content, and type (deliverable|note|template|reference) required",
        });
        return;
      }
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
        sendJson(res, 200, { success: true, documentId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
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
