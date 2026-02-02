import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";

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
      console.log("[SelfUpgrade] Restart requested by admin; exiting for process manager restart.");
      process.exit(0);
    }
    return result?.restartRequested ?? false;
  } catch (error) {
    console.error("[SelfUpgrade] Failed to check restart request:", error);
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
    console.log(
      "[SelfUpgrade] Pending upgrade: runtime %s -> %s, openclaw %s -> %s",
      config.runtimeServiceVersion,
      pendingUpgrade.targetRuntimeVersion,
      config.openclawVersion,
      pendingUpgrade.targetOpenclawVersion
    );
    console.log("[SelfUpgrade] Exiting for process manager to run new image.");
    process.exit(0);
  } catch (error) {
    console.error("[SelfUpgrade] Failed to check or apply pending upgrade:", error);
    return false;
  }
  return true;
}
