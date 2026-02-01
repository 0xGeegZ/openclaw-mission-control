# Runtime Version Management — v2 Roadmap

> **Status**: Planned for v2  
> **Priority**: High  
> **Dependencies**: v1 foundation (basic version tracking)

---

## Overview

This document outlines the v2 vision for automated runtime version management, including fleet-wide upgrades, rollback capabilities, and admin tooling.

**v1 provides:**
- Version tracking in schema (`openclawVersion`, `runtimeServiceVersion`)
- `/health` and `/version` endpoints on runtime
- Manual upgrade process via SSH

**v2 will provide:**
- Automated rolling upgrades
- Canary deployment strategy
- One-click rollback
- Admin UI for fleet management
- Self-healing capabilities

---

## 1. Schema Enhancements

### Dedicated `runtimes` Table

Instead of embedding runtime config in `accounts`, create a dedicated table:

```typescript
runtimes: defineTable({
  accountId: v.id("accounts"),
  
  // Infrastructure
  provider: v.union(
    v.literal("digitalocean"),
    v.literal("fly"),
    v.literal("aws"),
    v.literal("gcp")
  ),
  providerId: v.string(),        // Droplet ID, Fly machine ID, etc.
  ipAddress: v.string(),
  region: v.string(),
  
  // Versions
  openclawVersion: v.string(),
  runtimeServiceVersion: v.string(),
  dockerImageTag: v.string(),
  
  // Status
  status: v.union(
    v.literal("provisioning"),
    v.literal("online"),
    v.literal("degraded"),
    v.literal("offline"),
    v.literal("upgrading"),
    v.literal("error")
  ),
  lastHealthCheck: v.optional(v.number()),
  healthScore: v.optional(v.number()),  // 0-100
  
  // Upgrade state
  pendingUpgrade: v.optional(v.object({
    targetOpenclawVersion: v.string(),
    targetRuntimeVersion: v.string(),
    initiatedAt: v.number(),
    initiatedBy: v.string(),
    strategy: v.union(
      v.literal("immediate"),
      v.literal("rolling"),
      v.literal("canary")
    ),
  })),
  
  // Upgrade history (last 10)
  upgradeHistory: v.array(v.object({
    fromOpenclawVersion: v.string(),
    toOpenclawVersion: v.string(),
    fromRuntimeVersion: v.string(),
    toRuntimeVersion: v.string(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("rolled_back")
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    duration: v.optional(v.number()),
    error: v.optional(v.string()),
    initiatedBy: v.string(),
  })),
  
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_account", ["accountId"])
  .index("by_status", ["status"])
  .index("by_openclaw_version", ["openclawVersion"])
  .index("by_provider_region", ["provider", "region"]),
```

### Global Version Config Table

```typescript
systemConfig: defineTable({
  key: v.string(),
  value: v.any(),
  updatedAt: v.number(),
  updatedBy: v.string(),
})
  .index("by_key", ["key"]),

// Example records:
// { key: "latest_openclaw_version", value: "v1.2.5" }
// { key: "latest_runtime_version", value: "v0.5.2" }
// { key: "min_supported_openclaw", value: "v1.1.0" }
// { key: "upgrade_strategy", value: "rolling" }
// { key: "upgrade_batch_percent", value: 10 }
```

---

## 2. Upgrade Orchestration Service

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Upgrade Orchestration Service                  │
│                  (Runs on dedicated infra)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │  Upgrade Queue  │    │  Health Monitor │                    │
│  │                 │    │                 │                    │
│  │  - Pending      │    │  - Poll health  │                    │
│  │  - In Progress  │    │  - Track errors │                    │
│  │  - Completed    │    │  - Alert on     │                    │
│  │                 │    │    degradation  │                    │
│  └────────┬────────┘    └────────┬────────┘                    │
│           │                      │                              │
│           └──────────┬───────────┘                              │
│                      │                                          │
│           ┌──────────▼──────────┐                               │
│           │  Upgrade Executor   │                               │
│           │                     │                               │
│           │  - SSH to droplet   │                               │
│           │  - Run upgrade      │                               │
│           │  - Verify health    │                               │
│           │  - Rollback if fail │                               │
│           └──────────┬──────────┘                               │
│                      │                                          │
└──────────────────────┼──────────────────────────────────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │   Convex Backend    │
            │                     │
            │  - runtimes table   │
            │  - systemConfig     │
            │  - activities       │
            └─────────────────────┘
```

### Upgrade Flow

```typescript
// packages/upgrade-service/src/orchestrator.ts

interface UpgradeJob {
  id: string;
  accountId: string;
  targetOpenclawVersion: string;
  targetRuntimeVersion: string;
  strategy: "immediate" | "rolling" | "canary";
  status: "pending" | "in_progress" | "completed" | "failed" | "rolled_back";
  startedAt: number;
  completedAt?: number;
  error?: string;
}

class UpgradeOrchestrator {
  /**
   * Start a fleet-wide upgrade with specified strategy.
   */
  async startFleetUpgrade(
    targetVersion: string,
    strategy: "rolling" | "canary"
  ): Promise<void> {
    const runtimes = await this.getAllRuntimes();
    
    if (strategy === "canary") {
      await this.canaryUpgrade(runtimes, targetVersion);
    } else {
      await this.rollingUpgrade(runtimes, targetVersion);
    }
  }
  
  /**
   * Canary: Upgrade internal test account first, monitor, then rollout.
   */
  async canaryUpgrade(
    runtimes: Runtime[],
    targetVersion: string
  ): Promise<void> {
    // 1. Find canary account (internal test)
    const canary = runtimes.find(r => r.isCanary);
    if (!canary) throw new Error("No canary account configured");
    
    console.log(`[Canary] Starting canary upgrade on ${canary.accountId}`);
    
    // 2. Upgrade canary
    await this.upgradeRuntime(canary, targetVersion);
    
    // 3. Monitor for bake time (30 minutes)
    const bakeTimeMs = 30 * 60 * 1000;
    const healthy = await this.monitorHealth(canary, bakeTimeMs);
    
    if (!healthy) {
      console.error("[Canary] Canary unhealthy, aborting fleet upgrade");
      await this.rollbackRuntime(canary);
      return;
    }
    
    console.log("[Canary] Canary healthy, proceeding with rolling upgrade");
    
    // 4. Proceed with rolling upgrade for remaining runtimes
    const remaining = runtimes.filter(r => r.accountId !== canary.accountId);
    await this.rollingUpgrade(remaining, targetVersion);
  }
  
  /**
   * Rolling: Upgrade in batches, pause and check health between batches.
   */
  async rollingUpgrade(
    runtimes: Runtime[],
    targetVersion: string,
    batchPercent: number = 10
  ): Promise<void> {
    const batchSize = Math.max(1, Math.ceil(runtimes.length * (batchPercent / 100)));
    const batches = chunk(runtimes, batchSize);
    
    console.log(`[Rolling] Starting rolling upgrade: ${batches.length} batches of ${batchSize}`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[Rolling] Batch ${i + 1}/${batches.length}`);
      
      // Upgrade batch in parallel
      const results = await Promise.allSettled(
        batch.map(r => this.upgradeRuntime(r, targetVersion))
      );
      
      // Check batch results
      const failures = results.filter(r => r.status === "rejected");
      const failureRate = failures.length / batch.length;
      
      if (failureRate > 0.2) { // >20% failures in batch
        console.error(`[Rolling] High failure rate (${failureRate * 100}%), halting upgrade`);
        await this.recordUpgradeHalted(targetVersion, "high_failure_rate");
        break;
      }
      
      // Wait between batches for stabilization
      if (i < batches.length - 1) {
        console.log("[Rolling] Waiting 60s before next batch...");
        await sleep(60_000);
        
        // Check global health
        const globalHealth = await this.checkGlobalHealth();
        if (globalHealth < 0.95) { // <95% healthy
          console.error(`[Rolling] Global health degraded (${globalHealth * 100}%), halting`);
          break;
        }
      }
    }
    
    console.log("[Rolling] Rolling upgrade complete");
  }
  
  /**
   * Upgrade a single runtime.
   */
  async upgradeRuntime(runtime: Runtime, targetVersion: string): Promise<void> {
    // 1. Mark upgrade pending
    await this.convex.mutation(api.runtimes.markUpgradePending, {
      runtimeId: runtime.id,
      targetVersion,
    });
    
    try {
      // 2. SSH to droplet and run upgrade commands
      const ssh = await this.connectSSH(runtime.ipAddress);
      
      await ssh.exec([
        'cd ~/openclaw',
        'git fetch --tags',
        `git checkout ${targetVersion}`,
        'docker compose pull',
        'docker compose down',
        'docker compose up -d',
      ].join(' && '));
      
      // 3. Wait for runtime to come back healthy
      const healthy = await this.waitForHealthy(runtime.ipAddress, {
        timeout: 120_000,
        interval: 5_000,
      });
      
      if (!healthy) {
        throw new Error("Runtime did not become healthy after upgrade");
      }
      
      // 4. Verify version
      const version = await this.getRemoteVersion(runtime.ipAddress);
      if (version !== targetVersion) {
        throw new Error(`Version mismatch: expected ${targetVersion}, got ${version}`);
      }
      
      // 5. Mark success
      await this.convex.mutation(api.runtimes.markUpgradeComplete, {
        runtimeId: runtime.id,
        version: targetVersion,
        status: "success",
      });
      
    } catch (error) {
      console.error(`[Upgrade] Failed for ${runtime.accountId}:`, error);
      
      // Mark failure
      await this.convex.mutation(api.runtimes.markUpgradeComplete, {
        runtimeId: runtime.id,
        version: targetVersion,
        status: "failed",
        error: error.message,
      });
      
      // Attempt rollback
      await this.rollbackRuntime(runtime);
      
      throw error;
    }
  }
  
  /**
   * Rollback a runtime to previous version.
   */
  async rollbackRuntime(runtime: Runtime): Promise<void> {
    const previousVersion = runtime.upgradeHistory[0]?.fromOpenclawVersion;
    if (!previousVersion) {
      console.error(`[Rollback] No previous version to rollback to`);
      return;
    }
    
    console.log(`[Rollback] Rolling back ${runtime.accountId} to ${previousVersion}`);
    
    const ssh = await this.connectSSH(runtime.ipAddress);
    
    await ssh.exec([
      'cd ~/openclaw',
      `git checkout ${previousVersion}`,
      'docker compose pull',
      'docker compose down',
      'docker compose up -d',
    ].join(' && '));
    
    await this.convex.mutation(api.runtimes.markRolledBack, {
      runtimeId: runtime.id,
      version: previousVersion,
    });
  }
}
```

---

## 3. Admin UI for Fleet Management

### System Settings > Runtime Management (Super Admin Only)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ System > Runtime Management                              [Super Admin Only] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Version Status                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Component           Current   Latest    Status                          │ │
│ │ ─────────────────────────────────────────────────────────────────────── │ │
│ │ OpenClaw            v1.2.3    v1.2.5    ⚠️  Update available            │ │
│ │ Runtime Service     v0.5.0    v0.5.2    ⚠️  Update available            │ │
│ │                                                                         │ │
│ │                                            [Check for Updates]          │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Fleet Overview                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Total Runtimes: 127                                                     │ │
│ │                                                                         │ │
│ │ By Status:                                                              │ │
│ │   🟢 Online      118 (93%)  ████████████████████████████████████████    │ │
│ │   🟡 Degraded      4 (3%)   ██                                          │ │
│ │   🔴 Offline       3 (2%)   █                                           │ │
│ │   🔵 Upgrading     2 (2%)   █                                           │ │
│ │                                                                         │ │
│ │ By OpenClaw Version:                                                    │ │
│ │   v1.2.5        100 (79%)  ████████████████████████████████             │ │
│ │   v1.2.3         20 (16%)  ████████                                     │ │
│ │   v1.2.1          5 (4%)   ██                                           │ │
│ │   v1.1.x          2 (2%)   █  ← ⚠️ Below minimum supported              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Start Fleet Upgrade                                                         │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │                                                                         │ │
│ │ Target Version:  [v1.2.5 ▾]                                             │ │
│ │                                                                         │ │
│ │ Strategy:                                                               │ │
│ │   (•) Rolling (10% batches, 60s between)                               │ │
│ │   ( ) Canary (test on internal account first, then roll out)           │ │
│ │   ( ) Immediate (all at once - not recommended)                        │ │
│ │                                                                         │ │
│ │ Options:                                                                │ │
│ │   ☑ Auto-rollback on failure                                           │ │
│ │   ☑ Pause on >5% failure rate                                          │ │
│ │   ☐ Skip already-upgraded runtimes                                     │ │
│ │                                                                         │ │
│ │                        [Preview Upgrade Plan]  [Start Upgrade]         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Recent Upgrades                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Time          Version     Strategy   Success  Failed  Duration          │ │
│ │ ───────────────────────────────────────────────────────────────────────  │ │
│ │ 2h ago        v1.2.5      Rolling    98%      2%      45m               │ │
│ │ 3d ago        v1.2.3      Canary     100%     0%      2h                │ │
│ │ 1w ago        v1.2.1      Rolling    95%      5%      1h                │ │
│ │                                                                         │ │
│ │                                              [View All Upgrade History] │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Individual Runtime View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Runtime: Acme Corp (acc_abc123)                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Status: 🟢 Online              Health Score: 98/100                         │
│                                                                             │
│ Infrastructure                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Provider:      DigitalOcean                                             │ │
│ │ Droplet ID:    do_12345678                                              │ │
│ │ IP Address:    167.99.123.45                                            │ │
│ │ Region:        NYC1                                                     │ │
│ │ Created:       2024-06-15                                               │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Versions                                                                    │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ OpenClaw:         v1.2.3  (latest: v1.2.5)  [Upgrade]                   │ │
│ │ Runtime Service:  v0.5.0  (latest: v0.5.2)  [Upgrade]                   │ │
│ │ Last Upgrade:     3 days ago (success)                                  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Upgrade History                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Time          From      To        Status      Duration                  │ │
│ │ ──────────────────────────────────────────────────────────────────────  │ │
│ │ 3d ago        v1.2.1    v1.2.3    ✅ Success   2m 34s                   │ │
│ │ 2w ago        v1.2.0    v1.2.1    ✅ Success   3m 12s                   │ │
│ │ 1mo ago       v1.1.5    v1.2.0    ⚠️ Rolled    5m 45s                   │ │
│ │                                     back                                │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Actions                                                                     │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ [Upgrade to Latest]  [Force Restart]  [View Logs]  [SSH Console]       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Self-Upgrade Agent

Enable runtimes to upgrade themselves when instructed:

```typescript
// apps/runtime/src/self-upgrade.ts

/**
 * Check for pending upgrades on heartbeat.
 * If upgrade is pending, initiate self-upgrade.
 */
export async function checkForSelfUpgrade(config: RuntimeConfig): Promise<void> {
  const client = getConvexClient();
  
  const runtime = await client.query(api.runtimes.get, {
    accountId: config.accountId,
  });
  
  if (!runtime?.pendingUpgrade) return;
  
  const { targetOpenclawVersion, targetRuntimeVersion } = runtime.pendingUpgrade;
  
  console.log(`[SelfUpgrade] Pending upgrade to OpenClaw ${targetOpenclawVersion}`);
  
  // Mark as upgrading
  await client.mutation(api.runtimes.updateStatus, {
    accountId: config.accountId,
    status: "upgrading",
  });
  
  try {
    // Execute upgrade
    await executeSelfUpgrade(targetOpenclawVersion);
    
    // Verify
    const newVersion = await detectOpenClawVersion();
    if (newVersion !== targetOpenclawVersion) {
      throw new Error(`Version mismatch after upgrade`);
    }
    
    // Report success
    await client.mutation(api.runtimes.markUpgradeComplete, {
      accountId: config.accountId,
      version: targetOpenclawVersion,
      status: "success",
    });
    
    console.log(`[SelfUpgrade] Successfully upgraded to ${targetOpenclawVersion}`);
    
    // Restart process to apply changes
    process.exit(0); // Supervisor will restart
    
  } catch (error) {
    console.error(`[SelfUpgrade] Failed:`, error);
    
    await client.mutation(api.runtimes.markUpgradeComplete, {
      accountId: config.accountId,
      version: targetOpenclawVersion,
      status: "failed",
      error: error.message,
    });
  }
}

async function executeSelfUpgrade(targetVersion: string): Promise<void> {
  const { execSync } = await import("child_process");
  
  const commands = [
    'cd ~/openclaw',
    'git fetch --tags',
    `git checkout ${targetVersion}`,
    'docker compose pull',
    'docker compose down',
    'docker compose up -d',
  ];
  
  execSync(commands.join(' && '), { stdio: 'inherit' });
}
```

---

## 5. Monitoring & Alerts

### Health Metrics to Track

```typescript
interface RuntimeMetrics {
  // Availability
  uptimePercent: number;           // Target: 99.9%
  healthCheckSuccessRate: number;  // Target: 99%
  
  // Performance
  avgResponseTimeMs: number;       // Target: <500ms
  p99ResponseTimeMs: number;       // Target: <2000ms
  
  // Delivery
  notificationDeliveryRate: number; // Target: 99%
  avgDeliveryLatencyMs: number;     // Target: <5000ms
  
  // Errors
  errorRate: number;               // Target: <1%
  crashCount24h: number;           // Target: 0
}
```

### Alert Conditions

| Alert | Condition | Severity |
|-------|-----------|----------|
| Runtime offline | No health check for >5min | Critical |
| High error rate | >5% errors in 15min | High |
| Upgrade failed | Upgrade status = failed | High |
| Version outdated | Version < min_supported | Medium |
| Health degraded | Health score < 80 | Medium |
| Fleet upgrade stalled | Upgrade pending >1h | Medium |

---

## 6. Implementation Phases

### Phase 2.1: Foundation (1-2 weeks)
- [ ] Create `runtimes` table
- [ ] Create `systemConfig` table
- [ ] Migrate existing runtime data
- [ ] Add fleet overview queries

### Phase 2.2: Upgrade Service (2-3 weeks)
- [ ] Build upgrade orchestration service
- [ ] Implement SSH-based upgrade executor
- [ ] Implement rolling upgrade strategy
- [ ] Implement canary strategy
- [ ] Add rollback capability

### Phase 2.3: Admin UI (1-2 weeks)
- [ ] Fleet overview dashboard
- [ ] Individual runtime view
- [ ] Upgrade initiation UI
- [ ] Upgrade history view

### Phase 2.4: Self-Upgrade (1 week)
- [ ] Self-upgrade agent in runtime
- [ ] Automatic restart on upgrade
- [ ] Version verification

### Phase 2.5: Monitoring (1 week)
- [ ] Health metrics collection
- [ ] Alert configuration
- [ ] Integration with external monitoring (optional)

---

## 7. Open Questions

1. **Multi-provider support**: Should we abstract the upgrade process to support Fly.io, AWS, etc.?
2. **Blue-green deployments**: Worth the complexity for zero-downtime upgrades?
3. **Scheduled upgrades**: Allow accounts to configure upgrade windows?
4. **Self-hosted runtimes**: Support customers running their own infrastructure?

---

## References

- [OpenClaw Update Docs](https://docs.openclaw.ai/platforms/digitalocean#updates)
- [DigitalOcean API - Droplets](https://docs.digitalocean.com/reference/api/api-reference/#tag/Droplets)
- [Kubernetes Rolling Updates](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/) (inspiration)
