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
import {
  recordSuccess,
  recordFailure,
  getAllMetrics,
  formatPrometheusMetrics,
} from "./metrics";

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
 * Fetch orchestrator agent id for the account.
 */
async function getOrchestratorAgentId(
  config: RuntimeConfig,
): Promise<Id<"agents"> | null> {
  const client = getConvexClient();
  const result = (await client.action(
    api.service.actions.getOrchestratorAgentId,
    {
      accountId: config.accountId,
      serviceToken: config.serviceToken,
    },
  )) as { orchestratorAgentId: Id<"agents"> | null };
  return result?.orchestratorAgentId ?? null;
}

/**
 * Check whether the given agent id is the account orchestrator.
 */
async function isOrchestratorAgent(
  agentId: string,
  config: RuntimeConfig,
): Promise<boolean> {
  const orchestratorAgentId = await getOrchestratorAgentId(config);
  return orchestratorAgentId != null && orchestratorAgentId === agentId;
}

/**
 * Resolve agent slugs to ids (lowercased, @ stripped).
 */
async function resolveAgentSlugs(
  config: RuntimeConfig,
  slugs: string[],
): Promise<Map<string, string>> {
  const client = getConvexClient();
  const agents = await client.action(api.service.actions.listAgents, {
    accountId: config.accountId,
    serviceToken: config.serviceToken,
  });
  const map = new Map<string, string>();
  for (const agent of agents) {
    if (agent?.slug) {
      map.set(String(agent.slug).toLowerCase(), String(agent._id));
    }
  }
  return new Map(
    slugs
      .map((slug) => slug.trim().replace(/^@/, "").toLowerCase())
      .filter((slug) => slug.length > 0)
      .map((slug) => [slug, map.get(slug) ?? ""]),
  );
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
        });
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
        });
        return;
      }

      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        log.warn("[task-status] Unknown session:", sessionKey);
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
        log.warn("[task-status] Invalid JSON:", error);
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
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
        log.warn("[task-status] Invalid status:", body.status);
        sendJson(res, 422, {
          success: false,
          error:
            "Invalid status: must be in_progress, review, done, or blocked",
        });
        return;
      }

      if (body.status === "blocked" && !body.blockedReason?.trim()) {
        log.warn("[task-status] Missing blockedReason for blocked status");
        sendJson(res, 422, {
          success: false,
          error: "blockedReason is required when status is blocked",
        });
        return;
      }

      log.info("[task-status] Request:", {
        agentId,
        taskId: body.taskId,
        status: body.status,
      });

      try {
        const client = getConvexClient();
        const result = await client.action(
          api.service.actions.updateTaskStatusFromAgent,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            taskId: body.taskId as Id<"tasks">,
            status: body.status as "in_progress" | "review" | "done" | "blocked",
            blockedReason: body.blockedReason,
          },
        );
        const duration = Date.now() - requestStart;
        recordSuccess("agent.task_status", duration);
        log.info("[task-status] Success:", {
          agentId,
          taskId: body.taskId,
          status: body.status,
          durationMs: duration,
        });
        sendJson(res, 200, { ...result, durationMs: duration });
      } catch (error) {
        const duration = Date.now() - requestStart;
        const message = error instanceof Error ? error.message : String(error);
        recordFailure("agent.task_status", duration, message);
        log.error("[task-status] Failed:", {
          agentId,
          taskId: body.taskId,
          status: body.status,
          error: message,
          durationMs: duration,
        });
        const mapped = mapTaskStatusError(message);
        sendJson(res, mapped.status, { success: false, error: mapped.message });
      }
      return;
    }

    if (req.url === "/agent/task-update") {
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
        });
        return;
      }

      const sessionHeader = req.headers["x-openclaw-session-key"];
      const sessionKey = Array.isArray(sessionHeader)
        ? sessionHeader[0]
        : sessionHeader;
      if (!sessionKey) {
        log.warn("[task-update] Missing session key");
        sendJson(res, 401, {
          success: false,
          error: "Missing x-openclaw-session-key header",
        });
        return;
      }

      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        log.warn("[task-update] Unknown session:", sessionKey);
        sendJson(res, 401, { success: false, error: "Unknown session key" });
        return;
      }

      if (!runtimeConfig) {
        sendJson(res, 500, { success: false, error: "Runtime not configured" });
        return;
      }

      let body: {
        taskId?: string;
        title?: string;
        description?: string;
        priority?: number;
        labels?: string[];
        assignedAgentIds?: string[];
        assignedUserIds?: string[];
        status?: string;
        blockedReason?: string;
        dueDate?: number;
      };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch (error) {
        log.warn("[task-update] Invalid JSON:", error);
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }

      if (!body?.taskId?.trim()) {
        log.warn("[task-update] Missing taskId");
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: taskId",
        });
        return;
      }

      const hasUpdates =
        body.title !== undefined ||
        body.description !== undefined ||
        body.priority !== undefined ||
        body.labels !== undefined ||
        body.assignedAgentIds !== undefined ||
        body.assignedUserIds !== undefined ||
        body.status !== undefined ||
        body.dueDate !== undefined;

      if (!hasUpdates) {
        log.warn("[task-update] No fields to update");
        sendJson(res, 400, {
          success: false,
          error:
            "At least one field (title, description, priority, labels, assignedAgentIds, assignedUserIds, status, dueDate) must be provided",
        });
        return;
      }

      if (body.status) {
        const allowedStatuses = new Set([
          "in_progress",
          "review",
          "done",
          "blocked",
        ]);
        if (!allowedStatuses.has(body.status)) {
          log.warn("[task-update] Invalid status:", body.status);
          sendJson(res, 422, {
            success: false,
            error: "Invalid status: must be in_progress, review, done, or blocked",
          });
          return;
        }
        if (body.status === "blocked" && !body.blockedReason?.trim()) {
          log.warn("[task-update] Missing blockedReason for blocked status");
          sendJson(res, 422, {
            success: false,
            error: "blockedReason is required when status is blocked",
          });
          return;
        }
      }

      if (body.priority !== undefined && (body.priority < 0 || body.priority > 4)) {
        log.warn("[task-update] Invalid priority:", body.priority);
        sendJson(res, 422, {
          success: false,
          error: "priority must be between 0 (highest) and 4 (lowest)",
        });
        return;
      }

      log.info("[task-update] Request:", {
        agentId,
        taskId: body.taskId,
        fields: [
          body.title && "title",
          body.description && "description",
          body.priority !== undefined && "priority",
          body.labels && "labels",
          body.assignedAgentIds && "assignedAgentIds",
          body.assignedUserIds && "assignedUserIds",
          body.status && "status",
          body.dueDate !== undefined && "dueDate",
        ]
          .filter(Boolean)
          .join(", "),
      });

      try {
        const client = getConvexClient();
        const result = await client.action(
          api.service.actions.updateTaskFromAgent,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            taskId: body.taskId as Id<"tasks">,
            title: body.title,
            description: body.description,
            priority: body.priority,
            labels: body.labels,
            assignedAgentIds: body.assignedAgentIds as
              | Id<"agents">[]
              | undefined,
            assignedUserIds: body.assignedUserIds as Id<"users">[] | undefined,
            status: body.status as
              | "in_progress"
              | "review"
              | "done"
              | "blocked"
              | undefined,
            blockedReason: body.blockedReason,
            dueDate: body.dueDate,
          },
        );
        const duration = Date.now() - requestStart;
        recordSuccess("agent.task_update", duration);
        log.info("[task-update] Success:", {
          agentId,
          taskId: body.taskId,
          changedFields: result.changedFields.length,
          durationMs: duration,
        });
        sendJson(res, 200, { ...result, success: true, durationMs: duration });
      } catch (error) {
        const duration = Date.now() - requestStart;
        const message = error instanceof Error ? error.message : String(error);
        recordFailure("agent.task_update", duration, message);
        log.error("[task-update] Failed:", {
          agentId,
          taskId: body.taskId,
          error: message,
          durationMs: duration,
        });
        const mapped = mapTaskStatusError(message);
        sendJson(res, mapped.status, { success: false, error: mapped.message });
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
        });
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
        });
        return;
      }
      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        log.warn("[task-create] Unknown session:", sessionKey);
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
        dueDate?: number;
        assigneeSlugs?: string[];
      };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch (error) {
        log.warn("[task-create] Invalid JSON:", error);
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.title?.trim()) {
        log.warn("[task-create] Missing title");
        sendJson(res, 400, {
          success: false,
          error: "Missing required field: title",
        });
        return;
      }
      log.info("[task-create] Request:", {
        agentId,
        title: body.title.substring(0, 50),
        status: body.status,
      });
      let assigneeIds: Id<"agents">[] | undefined;
      if (body.assigneeSlugs?.length) {
        const canAssign = await isOrchestratorAgent(agentId, runtimeConfig);
        if (!canAssign) {
          sendJson(res, 403, {
            success: false,
            error:
              "Forbidden: Only the orchestrator can assign agents during task creation",
          });
          return;
        }
        const assigneeMap = await resolveAgentSlugs(
          runtimeConfig,
          body.assigneeSlugs,
        );
        assigneeIds = Array.from(assigneeMap.values()).filter(
          Boolean,
        ) as Id<"agents">[];
        const missing = Array.from(assigneeMap.entries())
          .filter((entry) => !entry[1])
          .map((entry) => entry[0]);
        if (missing.length > 0) {
          sendJson(res, 422, {
            success: false,
            error: `Unknown assignee slugs: ${missing.join(", ")}`,
          });
          return;
        }
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
            dueDate: body.dueDate,
          },
        );
        if (assigneeIds?.length) {
          await client.action(api.service.actions.assignTaskFromAgent, {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            taskId: taskId as Id<"tasks">,
            assignedAgentIds: assigneeIds,
          });
        }
        const duration = Date.now() - requestStart;
        recordSuccess("agent.task_create", duration);
        log.info("[task-create] Success:", {
          agentId,
          taskId,
          durationMs: duration,
        });
        sendJson(res, 200, { success: true, taskId });
      } catch (error) {
        const duration = Date.now() - requestStart;
        const message = error instanceof Error ? error.message : String(error);
        recordFailure("agent.task_create", duration, message);
        log.error("[task-create] Failed:", {
          agentId,
          error: message,
          durationMs: duration,
        });
        sendJson(res, 403, { success: false, error: message });
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
      const canAssign = await isOrchestratorAgent(agentId, runtimeConfig);
      if (!canAssign) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: Only the orchestrator can assign agents",
        });
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
        const assigneeMap = await resolveAgentSlugs(
          runtimeConfig,
          normalizedSlugs,
        );
        const assigneeIds = Array.from(assigneeMap.values()).filter(
          Boolean,
        ) as Id<"agents">[];
        const missing = Array.from(assigneeMap.entries())
          .filter((entry) => !entry[1])
          .map((entry) => entry[0]);
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
        });
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
        });
        return;
      }
      const agentId = getAgentIdForSessionKey(sessionKey);
      if (!agentId) {
        log.warn("[document] Unknown session:", sessionKey);
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
      } catch (error) {
        log.warn("[document] Invalid JSON:", error);
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
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
        });
        return;
      }
      log.info("[document] Request:", {
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
          agentId,
          documentId,
          durationMs: duration,
        });
        sendJson(res, 200, { success: true, documentId });
      } catch (error) {
        const duration = Date.now() - requestStart;
        const message = error instanceof Error ? error.message : String(error);
        recordFailure("agent.document", duration, message);
        log.error("[document] Failed:", {
          agentId,
          error: message,
          durationMs: duration,
        });
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/task-message") {
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
      const canPost = await isOrchestratorAgent(agentId, runtimeConfig);
      if (!canPost) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: Only the orchestrator can post task messages",
        });
        return;
      }
      let body: { taskId?: string; content?: string };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.taskId?.trim() || !body?.content?.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required fields: taskId, content",
        });
        return;
      }
      try {
        const client = getConvexClient();
        const { messageId } = await client.action(
          api.service.actions.createTaskMessageForAgentTool,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            taskId: body.taskId as Id<"tasks">,
            content: body.content.trim(),
          },
        );
        sendJson(res, 200, { success: true, messageId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/task-list") {
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
      const canList = await isOrchestratorAgent(agentId, runtimeConfig);
      if (!canList) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: Only the orchestrator can list tasks",
        });
        return;
      }
      let body: { status?: string; assigneeSlug?: string; limit?: number };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (
        body.status &&
        body.status !== "inbox" &&
        body.status !== "assigned" &&
        body.status !== "in_progress" &&
        body.status !== "review" &&
        body.status !== "done" &&
        body.status !== "blocked" &&
        body.status !== "archived"
      ) {
        sendJson(res, 422, {
          success: false,
          error:
            "Invalid status: must be inbox, assigned, in_progress, review, done, blocked, or archived",
        });
        return;
      }
      const rawSlug = body.assigneeSlug?.trim();
      const assigneeSlug = rawSlug
        ? rawSlug.replace(/^@/, "").toLowerCase()
        : undefined;
      let assigneeAgentId: Id<"agents"> | undefined;
      if (assigneeSlug) {
        const assigneeMap = await resolveAgentSlugs(runtimeConfig, [
          assigneeSlug,
        ]);
        const resolvedId = assigneeMap.get(assigneeSlug) ?? "";
        if (!resolvedId) {
          sendJson(res, 422, {
            success: false,
            error: `Unknown assignee slug: ${assigneeSlug}`,
          });
          return;
        }
        assigneeAgentId = resolvedId as Id<"agents">;
      }
      try {
        const client = getConvexClient();
        const tasks = await client.action(
          api.service.actions.listTasksForAgentTool,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            status: body.status as
              | "inbox"
              | "assigned"
              | "in_progress"
              | "review"
              | "done"
              | "blocked"
              | "archived"
              | undefined,
            assigneeAgentId,
            limit: body.limit,
          },
        );
        sendJson(res, 200, { success: true, data: { tasks } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/task-get") {
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
      const canGet = await isOrchestratorAgent(agentId, runtimeConfig);
      if (!canGet) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: Only the orchestrator can get tasks",
        });
        return;
      }
      let body: { taskId?: string };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.taskId?.trim()) {
        sendJson(res, 400, { success: false, error: "taskId is required" });
        return;
      }
      try {
        const client = getConvexClient();
        const task = await client.action(
          api.service.actions.getTaskForAgentTool,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            taskId: body.taskId as Id<"tasks">,
          },
        );
        sendJson(res, 200, { success: true, data: { task } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/task-thread") {
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
      const canReadThread = await isOrchestratorAgent(agentId, runtimeConfig);
      if (!canReadThread) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: Only the orchestrator can read task threads",
        });
        return;
      }
      let body: { taskId?: string; limit?: number };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.taskId?.trim()) {
        sendJson(res, 400, { success: false, error: "taskId is required" });
        return;
      }
      try {
        const client = getConvexClient();
        const thread = await client.action(
          api.service.actions.listTaskThreadForAgentTool,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            taskId: body.taskId as Id<"tasks">,
            limit: body.limit,
          },
        );
        sendJson(res, 200, { success: true, data: { thread } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/task-search") {
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
      const canSearch = await isOrchestratorAgent(agentId, runtimeConfig);
      if (!canSearch) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: Only the orchestrator can search tasks",
        });
        return;
      }
      let body: { query?: string; limit?: number };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.query?.trim()) {
        sendJson(res, 400, { success: false, error: "query is required" });
        return;
      }
      try {
        const client = getConvexClient();
        const results = await client.action(
          api.service.actions.searchTasksForAgentTool,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            query: body.query.trim(),
            limit: body.limit,
          },
        );
        sendJson(res, 200, { success: true, data: { results } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/task-load") {
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
      let body: { taskId?: string; messageLimit?: number };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.taskId?.trim()) {
        sendJson(res, 400, { success: false, error: "taskId is required" });
        return;
      }
      try {
        const client = getConvexClient();
        const data = await client.action(
          api.service.actions.loadTaskDetailsForAgentTool,
          {
            accountId: runtimeConfig.accountId,
            serviceToken: runtimeConfig.serviceToken,
            agentId,
            taskId: body.taskId as Id<"tasks">,
            messageLimit: body.messageLimit,
          },
        );
        sendJson(res, 200, { success: true, data });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/get-agent-skills") {
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
      let body: { agentId?: string };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      try {
        const client = getConvexClient();
        const queryAgentId = body.agentId
          ? (body.agentId as Id<"agents">)
          : undefined;
        const skills = await client.action(api.service.actions.getAgentSkillsForTool, {
          accountId: runtimeConfig.accountId,
          agentId,
          serviceToken: runtimeConfig.serviceToken,
          queryAgentId,
        });
        sendJson(res, 200, { success: true, data: { agents: skills } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/task-delete") {
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
      const canDelete = await isOrchestratorAgent(agentId, runtimeConfig);
      if (!canDelete) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: Only the orchestrator can delete tasks",
        });
        return;
      }
      let body: { taskId?: string; reason?: string };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.taskId?.trim() || !body?.reason?.trim()) {
        sendJson(res, 400, {
          success: false,
          error: "Missing required fields: taskId, reason",
        });
        return;
      }
      try {
        const client = getConvexClient();
        await client.action(api.service.actions.deleteTaskFromAgent, {
          accountId: runtimeConfig.accountId,
          serviceToken: runtimeConfig.serviceToken,
          agentId,
          taskId: body.taskId as Id<"tasks">,
          reason: body.reason.trim(),
        });
        sendJson(res, 200, { success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
      }
      return;
    }

    if (req.url === "/agent/task-link-pr") {
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
      const canLink = await isOrchestratorAgent(agentId, runtimeConfig);
      if (!canLink) {
        sendJson(res, 403, {
          success: false,
          error: "Forbidden: Only the orchestrator can link tasks to PRs",
        });
        return;
      }
      let body: { taskId?: string; prNumber?: number };
      try {
        body = await readJsonBody<typeof body>(req);
      } catch {
        sendJson(res, 400, { success: false, error: "Invalid JSON body" });
        return;
      }
      if (!body?.taskId?.trim()) {
        sendJson(res, 400, { success: false, error: "taskId is required" });
        return;
      }
      if (body.prNumber == null || !Number.isFinite(body.prNumber)) {
        sendJson(res, 400, {
          success: false,
          error: "prNumber is required and must be numeric",
        });
        return;
      }
      try {
        const client = getConvexClient();
        await client.action(api.service.actions.linkTaskToPrForAgentTool, {
          accountId: runtimeConfig.accountId,
          serviceToken: runtimeConfig.serviceToken,
          agentId,
          taskId: body.taskId as Id<"tasks">,
          prNumber: body.prNumber,
        });
        sendJson(res, 200, {
          success: true,
          data: { taskId: body.taskId, prNumber: body.prNumber },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, 403, { success: false, error: message });
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
