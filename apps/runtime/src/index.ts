import { loadConfig, RuntimeConfig } from "./config";
import { startAgentSync, stopAgentSync } from "./agent-sync";
import { initConvexClient, getConvexClient, api } from "./convex-client";
import { startDeliveryLoop, stopDeliveryLoop } from "./delivery";
import {
  initGateway,
  shutdownGateway,
  waitForOpenClawGatewayReady,
} from "./gateway";
import { startHealthServer, stopHealthServer } from "./health";
import { startHeartbeats, stopHeartbeats } from "./heartbeat";
import { createLogger, setLogLevel } from "./logger";

const log = createLogger("[Runtime]");
let globalConfig: RuntimeConfig;
let agentWorkStarted = false;

/**
 * Extract a readable error message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Detect service token auth failures from Convex.
 */
function isServiceTokenError(message: string): boolean {
  return (
    message.includes("Invalid service token") ||
    message.includes("Forbidden: Account has no service token configured") ||
    message.includes("Service token does not match account")
  );
}

/**
 * Main entry point for runtime service.
 */
async function main() {
  const config = await loadConfig();
  globalConfig = config;
  setLogLevel(config.logLevel);

  log.info("=== OpenClaw Mission Control Runtime Service ===");
  log.info("Account ID:", config.accountId);
  log.info("Convex URL:", config.convexUrl);
  log.info(
    "Runtime Service v" + config.runtimeServiceVersion,
    "OpenClaw v" + config.openclawVersion,
  );

  initConvexClient(config);
  log.info("Convex client initialized");

  try {
    await initGateway(config);
    startHealthServer(config);

    /**
     * Start delivery, heartbeats, and agent sync once.
     */
    const startAgentWork = async () => {
      if (agentWorkStarted) return;
      agentWorkStarted = true;
      startDeliveryLoop(config);
      await startHeartbeats(config);
      startAgentSync(config);
    };

    const gatewayReady = await waitForOpenClawGatewayReady();
    if (gatewayReady) {
      await startAgentWork();
    } else {
      log.warn(
        "OpenClaw gateway not reachable yet; delaying delivery and heartbeats until it starts.",
      );
      const retry = async () => {
        const ready = await waitForOpenClawGatewayReady({ timeoutMs: 60000 });
        if (ready) {
          await startAgentWork();
          return;
        }
        setTimeout(retry, 5000);
      };
      void retry();
    }
  } catch (error) {
    const message = getErrorMessage(error);
    if (isServiceTokenError(message)) {
      log.error("Service token rejected by Convex.");
      log.error(
        "Ensure SERVICE_TOKEN was generated in this deployment:",
        config.convexUrl,
      );
      log.error(
        "If you have multiple deployments, regenerate in the one matching CONVEX_URL.",
      );
    }
    throw error;
  }

  log.info("Runtime service started successfully");

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("unhandledRejection", (reason, promise) => {
    log.error("Unhandled rejection at", promise, "reason:", reason);
    process.exit(1);
  });
  process.on("uncaughtException", (err) => {
    log.error("Uncaught exception:", err);
    process.exit(1);
  });
}

/**
 * Graceful shutdown handler.
 */
async function shutdown() {
  log.info("Shutting down...");

  stopDeliveryLoop();
  stopAgentSync();
  stopHeartbeats();
  await shutdownGateway();
  stopHealthServer();

  try {
    const client = getConvexClient();
    await client.action(api.service.actions.updateRuntimeStatus, {
      accountId: globalConfig.accountId,
      status: "offline",
      serviceToken: globalConfig.serviceToken,
    });
  } catch (error) {
    log.error("Failed to update offline status:", error);
  }

  log.info("Shutdown complete");
  process.exit(0);
}

main().catch((error) => {
  log.error("Fatal error:", error);
  process.exit(1);
});
