import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Execute container creation via orchestration script.
 * Called asynchronously from createContainer mutation.
 *
 * Spawns: orchestrator-containers.sh create {accountId} {port} {plan}
 * On success: Updates Convex container record to status="running"
 * On failure: Updates container record to status="failed" with error log
 *
 * Phase 1.2: Host-side integration pending (shell script execution requires
 * either process execution on host or HTTP endpoint for triggering provisioning)
 */
export const executeCreate = internalMutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
    assignedPort: v.number(),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Phase 1B: Record orchestration intent in database
      // Container status is "creating" from mutation; this action validates and progresses it

      const container = await ctx.db.get(args.containerId);
      if (!container) {
        throw new Error(`Container not found: ${args.containerId}`);
      }

      if (container.status !== "creating") {
        throw new Error(
          `Cannot provision container with status=${container.status}; expected status=creating`
        );
      }

      // Phase 1.2 TODO: Execute host-side provisioning via:
      // 1. child_process (if action runs on host)
      // 2. HTTP POST to /api/orchestrate/container/create endpoint
      // 3. Message queue (Bull, RabbitMQ) for deferred execution
      // Real implementation: await executeShell(
      //   `/opt/openclaw/orchestrator-containers.sh create ${args.accountId} ${args.assignedPort} ${args.plan}`
      // );

      // For MVP, mark container as running; actual provisioning deferred to Phase 1.2
      await ctx.db.patch(args.containerId, {
        status: "running",
        updatedAt: Date.now(),
      });

      console.log(
        `[Phase 1B] Container provisioning initiated (Phase 1.2 will add host execution)`,
        {
          containerId: args.containerId,
          accountId: args.accountId,
          port: args.assignedPort,
          plan: args.plan,
          status:
            "running (status updated; awaiting Phase 1.2 host provisioning)",
        }
      );
    } catch (error) {
      // Update status to "failed" and append error to log (preserving history)
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      const container = await ctx.db.get(args.containerId);
      const updatedErrorLog = container?.errorLog
        ? [
            ...container.errorLog,
            {
              timestamp: Date.now(),
              message: `[executeCreate] ${errorMsg}`,
            },
          ]
        : [
            {
              timestamp: Date.now(),
              message: `[executeCreate] ${errorMsg}`,
            },
          ];

      await ctx.db.patch(args.containerId, {
        status: "failed",
        updatedAt: Date.now(),
        errorLog: updatedErrorLog,
      });

      console.error(
        `[Phase 1B ERROR] Container creation failed for ${args.containerId}:`,
        errorMsg
      );
      throw error;
    }
  },
});

/**
 * Execute container deletion via orchestration script.
 * Called asynchronously from deleteContainer mutation.
 *
 * Spawns: orchestrator-containers.sh delete {accountId}
 * Cleans up Docker container, network, volumes, compose file
 *
 * Phase 1.2: Host-side integration pending (see executeCreate for details)
 */
export const executeDelete = internalMutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    try {
      const container = await ctx.db.get(args.containerId);
      if (!container) {
        throw new Error(`Container not found: ${args.containerId}`);
      }

      // Phase 1.2 TODO: Execute: orchestrator-containers.sh delete {accountId}
      // (see executeCreate for host integration pattern)

      await ctx.db.patch(args.containerId, {
        status: "deleted",
        updatedAt: Date.now(),
      });

      console.log(
        `[Phase 1B] Container deletion initiated (Phase 1.2 will add host execution)`,
        {
          containerId: args.containerId,
          accountId: args.accountId,
          status: "deleted (status updated; awaiting Phase 1.2 host cleanup)",
        }
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      const container = await ctx.db.get(args.containerId);
      const updatedErrorLog = container?.errorLog
        ? [
            ...container.errorLog,
            {
              timestamp: Date.now(),
              message: `[executeDelete] ${errorMsg}`,
            },
          ]
        : [
            {
              timestamp: Date.now(),
              message: `[executeDelete] ${errorMsg}`,
            },
          ];

      await ctx.db.patch(args.containerId, {
        status: "failed",
        updatedAt: Date.now(),
        errorLog: updatedErrorLog,
      });

      console.error(
        `[Phase 1B ERROR] Container deletion failed for ${args.containerId}:`,
        errorMsg
      );
      throw error;
    }
  },
});

/**
 * Execute container restart via orchestration script.
 * Called asynchronously from restartContainer mutation.
 *
 * Spawns: orchestrator-containers.sh restart {accountId}
 * Restarts docker-compose service and waits for health check
 *
 * Phase 1.2: Host-side integration pending (see executeCreate for details)
 */
export const executeRestart = internalMutation({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    try {
      const container = await ctx.db.get(args.containerId);
      if (!container) {
        throw new Error(`Container not found: ${args.containerId}`);
      }

      if (!["running", "failed"].includes(container.status)) {
        throw new Error(
          `Cannot restart container with status=${container.status}; expected running or failed`
        );
      }

      // Phase 1.2 TODO: Execute: orchestrator-containers.sh restart {accountId}
      // Reset health checks to validate restart succeeded
      await ctx.db.patch(args.containerId, {
        status: "running",
        healthChecksPassed: 0,
        updatedAt: Date.now(),
      });

      console.log(
        `[Phase 1B] Container restart initiated (Phase 1.2 will add host execution)`,
        {
          containerId: args.containerId,
          accountId: args.accountId,
          status:
            "running (health checks reset; awaiting Phase 1.2 host restart)",
        }
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);

      const container = await ctx.db.get(args.containerId);
      const updatedErrorLog = container?.errorLog
        ? [
            ...container.errorLog,
            {
              timestamp: Date.now(),
              message: `[executeRestart] ${errorMsg}`,
            },
          ]
        : [
            {
              timestamp: Date.now(),
              message: `[executeRestart] ${errorMsg}`,
            },
          ];

      await ctx.db.patch(args.containerId, {
        status: "failed",
        updatedAt: Date.now(),
        errorLog: updatedErrorLog,
      });

      console.error(
        `[Phase 1B ERROR] Container restart failed for ${args.containerId}:`,
        errorMsg
      );
      throw error;
    }
  },
});

/**
 * Poll and execute pending health checks.
 * Called by health check daemon every 30 seconds (via systemd timer).
 *
 * Phase 1B: Queries all running containers and polls their health status.
 * Phase 1.2 TODO: Spawns: orchestrator-containers.sh health-check
 *
 * Results update Convex container records with:
 * - healthChecksPassed (increment on pass)
 * - lastHealthCheck (timestamp)
 * - status (mark as "failed" if threshold exceeded)
 * - errorLog (append failure reasons)
 */
export const executeHealthCheckAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    try {
      const allContainers = await ctx.db.query("containers").collect();
      const runningContainers = allContainers.filter(
        (c) => c.status === "running"
      );

      if (runningContainers.length === 0) {
        console.log("[Phase 1B] No running containers to health-check");
        return;
      }

      // Phase 1.2 TODO: Execute health-check script and parse results:
      // const result = await executeShell(
      //   `/opt/openclaw/orchestrator-containers.sh health-check`
      // );
      // Parse and call logHealthCheckResult for each container

      // MVP: Simulate successful health checks for all running containers
      for (const container of runningContainers) {
        await ctx.db.patch(container._id, {
          healthChecksPassed: (container.healthChecksPassed || 0) + 1,
          lastHealthCheck: Date.now(),
        });
      }

      console.log(
        `[Phase 1B] Health check completed for ${runningContainers.length} running containers (Phase 1.2 will add host polling)`
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      console.error(`[Phase 1B ERROR] Health check failed:`, errorMsg);
      throw error;
    }
  },
});

/**
 * Health check for a single container.
 * Called from executeHealthCheckAll to update individual results.
 *
 * Updates container status to "failed" if 3 or more error logs accumulated.
 */
export const logHealthCheckResult = internalMutation({
  args: {
    containerId: v.id("containers"),
    passed: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    if (args.passed) {
      await ctx.db.patch(args.containerId, {
        healthChecksPassed: (container.healthChecksPassed || 0) + 1,
        lastHealthCheck: Date.now(),
      });
    } else {
      // Append error and potentially mark container as failed
      const updatedErrorLog = container?.errorLog
        ? [
            ...container.errorLog,
            {
              timestamp: Date.now(),
              message: args.errorMessage || "Health check failed",
            },
          ]
        : [
            {
              timestamp: Date.now(),
              message: args.errorMessage || "Health check failed",
            },
          ];

      // Mark as failed after 3 accumulated errors
      // Phase 1.2 TODO: Track consecutive failures instead of total errors for better recovery
      const shouldMarkFailed = updatedErrorLog.length >= 3;

      await ctx.db.patch(args.containerId, {
        status: shouldMarkFailed ? "failed" : container.status,
        lastHealthCheck: Date.now(),
        errorLog: updatedErrorLog,
      });
    }

    console.log(`[Phase 1B] Health check result logged for container`, {
      containerId: args.containerId,
      passed: args.passed,
      error: args.errorMessage,
    });
  },
});
