import http from "http";
import { RuntimeConfig } from "./config";
import { getDeliveryState } from "./delivery";
import { getGatewayState } from "./gateway";
import { getHeartbeatState } from "./heartbeat";
import { getConvexClient, api } from "./convex-client";
import { checkRestartRequested, checkAndApplyPendingUpgrade } from "./self-upgrade";

let server: http.Server | null = null;
let runtimeConfig: RuntimeConfig | null = null;

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

      const health = {
        status: gateway.isRunning && delivery.isRunning ? "healthy" : "degraded",
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
        },
        delivery: {
          running: delivery.isRunning,
          lastDelivery: delivery.lastDelivery,
          delivered: delivery.deliveredCount,
          failed: delivery.failedCount,
        },
        heartbeat: {
          running: heartbeat.isRunning,
          scheduledAgents: heartbeat.scheduledCount,
        },
        memory: process.memoryUsage(),

        timestamp: Date.now(),
      };
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health, null, 2));
      return;
    }
    
    res.writeHead(404);
    res.end("Not Found");
  });
  
  server.listen(config.healthPort, () => {
    console.log(`[Health] Server listening on port ${config.healthPort}`);
    console.log(`[Health] Runtime Service v${config.runtimeServiceVersion}`);
    console.log(`[Health] OpenClaw v${config.openclawVersion}`);
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
      console.error("[Health] Failed to update Convex status:", error);
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
