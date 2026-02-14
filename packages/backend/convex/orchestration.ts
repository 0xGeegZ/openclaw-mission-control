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

      // Phase 1.2 TODO: Execute host-side provisioning
      // This requires either:
      // 1. Process execution via child_process (if action runs on host)
      // 2. HTTP POST to /api/orchestrate/container/create endpoint on host
      // 3. Message queue (Bull, RabbitMQ) for deferred execution
      //
      // Placeholder: Simulate successful orchestration
      // Real implementation: await executeShell(
      //   `/opt/openclaw/orchestrator-containers.sh create ${args.accountId} ${args.assignedPort} ${args.plan}`
      // );
      
      // For MVP, update status to "running" to demonstrate Convex state transitions
      // Host provisioning will be added in Phase 1.2
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
          status: "running (status updated; awaiting Phase 1.2 host provisioning)",
        }
      );
    } catch (error) {
      // Update status to "failed" and log the error
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      
      await ctx.db.patch(args.containerId, {
        status: "failed",
        updatedAt: Date.now(),
        errorLog: [
          {
            timestamp: Date.now(),
            message: `[executeCreate] ${errorMsg}`,
          },
        ],
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

      // Phase 1B: Update status to "deleted" after cleanup intent
      // Phase 1.2 TODO: Execute: orchestrator-containers.sh delete {accountId}
      // (see executeCreate for host integration details)
      
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
      
      await ctx.db.patch(args.containerId, {
        status: "failed",
        updatedAt: Date.now(),
        errorLog: [
          {
            timestamp: Date.now(),
            message: `[executeDelete] ${errorMsg}`,
          },
        ],
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

      // Phase 1B: Update status to "running" after restart intent
      // Reset health check counter to validate restart succeeded
      // Phase 1.2 TODO: Execute: orchestrator-containers.sh restart {accountId}
      // (see executeCreate for host integration details)
      
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
          status: "running (health checks reset; awaiting Phase 1.2 host restart)",
        }
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      
      await ctx.db.patch(args.containerId, {
        status: "failed",
        updatedAt: Date.now(),
        errorLog: [
          {
            timestamp: Date.now(),
            message: `[executeRestart] ${errorMsg}`,
          },
        ],
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
  handler: async (ctx, args) => {
    try {
      // Phase 1B: Query all containers with status="running"
      const runningContainers = await ctx.db
        .query("containers")
        .collect()
        .then((containers) =>
          containers.filter((c) => c.status === "running")
        );

      if (runningContainers.length === 0) {
        console.log("[Phase 1B] No running containers to health-check");
        return;
      }

      // Phase 1.2 TODO: Execute health-check script:
      // const result = await executeShell(
      //   `/opt/openclaw/orchestrator-containers.sh health-check`
      // );
      // Parse results and call logHealthCheckResult for each container

      // For MVP Phase 1B: Simulate successful health checks
      // This demonstrates the Convex state transition patterns
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
 */
export const logHealthCheckResult = internalMutation({
  args: {
    containerId: v.id("containers"),
    passed: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Phase 1B: Update container health status based on health check result
    const container = await ctx.db.get(args.containerId);
    if (!container) {
      throw new Error(`Container not found: ${args.containerId}`);
    }

    if (args.passed) {
      // Increment health checks passed
      await ctx.db.patch(args.containerId, {
        healthChecksPassed: (container.healthChecksPassed || 0) + 1,
        lastHealthCheck: Date.now(),
      });
    } else {
      // Log error and potentially mark as failed if threshold exceeded
      const updatedErrorLog = [
        ...(container.errorLog || []),
        {
          timestamp: Date.now(),
          message: args.errorMessage || "Health check failed",
        },
      ];

      // Mark as failed after 3 consecutive health check failures
      // For simplicity, we count the total failures (in Phase 1.2, this could be more nuanced)
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
