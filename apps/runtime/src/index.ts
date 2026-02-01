import { loadConfig, RuntimeConfig } from "./config";
import { initConvexClient, getConvexClient, api } from "./convex-client";
import { initGateway, shutdownGateway } from "./gateway";
import { startDeliveryLoop, stopDeliveryLoop } from "./delivery";
import { startHeartbeats, stopHeartbeats } from "./heartbeat";
import { startHealthServer, stopHealthServer } from "./health";

let globalConfig: RuntimeConfig;

/**
 * Main entry point for runtime service.
 */
async function main() {
  console.log("=== Mission Control Runtime Service ===");
  
  // Load configuration (async - detects OpenClaw version)
  const config = await loadConfig();
  globalConfig = config;
  
  console.log(`Account ID: ${config.accountId}`);
  console.log(`Runtime Service: v${config.runtimeServiceVersion}`);
  console.log(`OpenClaw: v${config.openclawVersion}`);
  
  // Initialize Convex client
  initConvexClient(config);
  console.log("Convex client initialized");
  
  // Initialize OpenClaw gateway
  await initGateway(config);
  
  // Start notification delivery
  startDeliveryLoop(config);
  
  // Start heartbeat scheduler
  await startHeartbeats(config);
  
  // Start health endpoint
  startHealthServer(config);
  
  console.log("Runtime service started successfully");
  
  // Graceful shutdown
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

/**
 * Graceful shutdown handler.
 */
async function shutdown() {
  console.log("\nShutting down...");
  
  stopDeliveryLoop();
  stopHeartbeats();
  await shutdownGateway();
  stopHealthServer();
  
  // Mark as offline in Convex
  try {
    const client = getConvexClient();
      // Update status via service action (requires service auth)
      await client.action(api.service.actions.updateRuntimeStatus as any, {
        accountId: globalConfig.accountId,
        status: "offline",
        serviceToken: globalConfig.serviceToken,
      });
  } catch (error) {
    console.error("Failed to update offline status:", error);
  }
  
  console.log("Shutdown complete");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
