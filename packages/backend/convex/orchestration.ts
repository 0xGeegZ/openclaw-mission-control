import { internalAction } from "./_generated/server";
import { v } from "convex/values";

/**
 * Execute container creation via orchestration script.
 * Called asynchronously from createContainer mutation.
 * 
 * Spawns: orchestrator-containers.sh create {accountId} {port} {plan}
 * On success: Updates Convex container record to status="running"
 * On failure: Updates container record to status="failed" with error log
 */
export const executeCreate = internalAction({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
    assignedPort: v.number(),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    // TODO: Phase 1B — Implement orchestrator-containers.sh create call
    // This requires one of:
    // 1. Direct process execution (if running on same host as Docker)
    // 2. HTTP call to host API that triggers shell script
    // 3. Message queue (Bull, RabbitMQ) for async orchestration
    //
    // For MVP, assuming host-based execution:
    // const result = await executeShell(
    //   `/opt/openclaw/orchestrator-containers.sh create ${args.accountId} ${args.assignedPort} ${args.plan}`
    // );
    //
    // On success, update container status to "running"
    // On failure, update to "failed" and log error to Convex errorLog
    
    console.log(
      `[Phase 1B TODO] Execute container create for account ${args.accountId}`,
      {
        containerId: args.containerId,
        port: args.assignedPort,
        plan: args.plan,
      }
    );
  },
});

/**
 * Execute container deletion via orchestration script.
 * Called asynchronously from deleteContainer mutation.
 * 
 * Spawns: orchestrator-containers.sh delete {accountId}
 * Cleans up Docker container, network, volumes, compose file
 */
export const executeDelete = internalAction({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    // TODO: Phase 1B — Implement orchestrator-containers.sh delete call
    
    console.log(
      `[Phase 1B TODO] Execute container delete for account ${args.accountId}`,
      {
        containerId: args.containerId,
      }
    );
  },
});

/**
 * Execute container restart via orchestration script.
 * Called asynchronously from restartContainer mutation.
 * 
 * Spawns: orchestrator-containers.sh restart {accountId}
 * Restarts docker-compose service and waits for health check
 */
export const executeRestart = internalAction({
  args: {
    accountId: v.id("accounts"),
    containerId: v.id("containers"),
  },
  handler: async (ctx, args) => {
    // TODO: Phase 1B — Implement orchestrator-containers.sh restart call
    
    console.log(
      `[Phase 1B TODO] Execute container restart for account ${args.accountId}`,
      {
        containerId: args.containerId,
      }
    );
  },
});

/**
 * Poll and execute pending health checks.
 * Called by health check daemon every 30 seconds.
 * 
 * Spawns: orchestrator-containers.sh health-check
 * Updates Convex healthChecksPassed counter and logs failures
 */
export const executeHealthCheckAll = internalAction({
  args: {},
  handler: async (ctx, args) => {
    // TODO: Phase 1B — Implement orchestrator-containers.sh health-check call
    // Results come back as JSON or structured output
    // Update Convex container records with:
    // - healthChecksPassed (increment on pass, reset on fail)
    // - lastHealthCheck (timestamp)
    // - status (mark as "failed" if threshold exceeded)
    // - errorLog (append failure reasons)
    
    console.log(`[Phase 1B TODO] Execute health check for all containers`);
  },
});

/**
 * Health check for a single container.
 * Called from executeHealthCheckAll to update individual results.
 */
export const logHealthCheckResult = internalAction({
  args: {
    containerId: v.id("containers"),
    passed: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // TODO: Phase 1B — Call Convex mutation to update container health status
    // ctx.runMutation("updateContainerHealthStatus", {
    //   containerId: args.containerId,
    //   passed: args.passed,
    // });
    //
    // If failed and error message provided:
    // ctx.runMutation("logContainerError", {
    //   containerId: args.containerId,
    //   message: args.errorMessage,
    // });
    
    console.log(`[Phase 1B TODO] Log health check result for container`, {
      containerId: args.containerId,
      passed: args.passed,
      error: args.errorMessage,
    });
  },
});
