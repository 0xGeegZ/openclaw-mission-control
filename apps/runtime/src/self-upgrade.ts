import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import { createLogger } from "./logger";

const log = createLogger("[SelfUpgrade]");

/** When set to "exit" (default), runtime exits on upgrade/restart so process manager can restart. */
const UPGRADE_MODE = process.env.UPGRADE_MODE || "exit";

/**
 * Check if admin requested runtime restart and exit so process manager restarts the service.
 * Call this periodically (e.g. after health status update); if restart was requested, exit(0).
 */
export async function checkRestartRequested(config: RuntimeConfig): Promise<boolean> {
  try {
    const client = getConvexClient();
    const result = await client.action(api.service.actions.checkAndClearRestartRequested, {
      accountId: config.accountId,
      serviceToken: config.serviceToken,
    });
    if (result?.restartRequested) {
      log.info("Restart requested by admin; exiting for process manager restart.");
      if (UPGRADE_MODE === "exit") process.exit(0);
      return true;
    }
    return result?.restartRequested ?? false;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error && error.cause != null
          ? String(error.cause)
          : null;
    log.error(
      "Failed to check restart request:",
      cause ? `${msg} (cause: ${cause})` : msg,
    );
    return false;
  }
}

/**
 * Check for a pending upgrade (fleet). If present and strategy is "immediate",
 * exit so the process manager can run the new image. Success is recorded when
 * the runtime reports the target versions.
 */
export async function checkAndApplyPendingUpgrade(config: RuntimeConfig): Promise<boolean> {
  try {
    const client = getConvexClient();
    const pendingUpgrade = await client.action(api.service.actions.getPendingUpgrade, {
      accountId: config.accountId,
      serviceToken: config.serviceToken,
    });
    if (!pendingUpgrade) {
      return false;
    }
    const targetMatches =
      pendingUpgrade.targetOpenclawVersion === config.openclawVersion &&
      pendingUpgrade.targetRuntimeVersion === config.runtimeServiceVersion;
    if (targetMatches) {
      // Runtime already on target versions; no restart required.
      return false;
    }
    if (pendingUpgrade.strategy !== "immediate") {
      return false;
    }
    log.info(
      "Pending upgrade: runtime",
      config.runtimeServiceVersion,
      "->",
      pendingUpgrade.targetRuntimeVersion,
      "openclaw",
      config.openclawVersion,
      "->",
      pendingUpgrade.targetOpenclawVersion
    );
    log.info("Exiting for process manager to run new image.");
    if (UPGRADE_MODE === "exit") process.exit(0);
    return true;
  } catch (error) {
    log.error("Failed to check or apply pending upgrade:", error);
    return false;
  }
}
