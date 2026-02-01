# Module 13: Runtime Service

> Implement per-account runtime service for OpenClaw agent execution.

---

## ESSENTIAL CONTEXT — READ FIRST

**Before implementing this module, you MUST read:**

1. **`docs/mission-control-initial-article.md`** — Gateway, sessions, heartbeat concepts (Sections 2-8)
2. **`docs/mission-control-cursor-core-instructions.md`** — Runtime contract (Section 5)
3. **OpenClaw docs**: https://docs.openclaw.ai/start/getting-started

**Key understanding:**
- **This is the bridge between Convex (shared brain) and OpenClaw (agent runtime)**
- One runtime server per customer account (DigitalOcean Droplet)
- Session key format: `agent:{slug}:{accountId}`
- Runtime responsibilities: notification delivery, heartbeat scheduling, health reporting
- At-least-once delivery semantics (idempotent)

---

## 1. Context & Goal

This module implements the per-account runtime service that:
- Runs on a DigitalOcean Droplet (one per customer)
- Manages OpenClaw gateway and agent sessions
- Delivers notifications to agents
- Executes agent heartbeats
- Reports health status to Convex

**This is the bridge between Convex (shared brain) and OpenClaw (agent runtime).**

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Per-Account Runtime Server                  │
│                     (DigitalOcean Droplet)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │  OpenClaw       │    │  Runtime        │                    │
│  │  Gateway        │◄───│  Manager        │                    │
│  │                 │    │                 │                    │
│  │  - Sessions     │    │  - Delivery     │                    │
│  │  - Message      │    │  - Heartbeat    │                    │
│  │    routing      │    │  - Health       │                    │
│  └─────────────────┘    └────────┬────────┘                    │
│                                  │                              │
│                                  │ Convex Client                │
│                                  ▼                              │
│  ┌─────────────────────────────────────────────────────────────┐
│  │                    Convex Backend                           │
│  │  - notifications.listUndeliveredForAccount                  │
│  │  - notifications.markDelivered                              │
│  │  - agents.upsertHeartbeat                                   │
│  │  - messages.createFromAgent                                 │
│  └─────────────────────────────────────────────────────────────┘
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Files to Create

| Path | Purpose |
|------|---------|
| `apps/runtime/src/index.ts` | Entry point |
| `apps/runtime/src/config.ts` | Environment config |
| `apps/runtime/src/convex-client.ts` | Convex client setup |
| `apps/runtime/src/gateway.ts` | OpenClaw gateway manager |
| `apps/runtime/src/delivery.ts` | Notification delivery loop |
| `apps/runtime/src/heartbeat.ts` | Heartbeat scheduler |
| `apps/runtime/src/health.ts` | Health check endpoint |
| `apps/runtime/Dockerfile` | Container build |

---

## 4. Configuration

```typescript
// apps/runtime/src/config.ts
import { Id } from "@packages/backend/convex/_generated/dataModel";

export interface RuntimeConfig {
  /** Account ID this runtime serves */
  accountId: Id<"accounts">;
  
  /** Convex deployment URL */
  convexUrl: string;
  
  /** Service authentication token */
  serviceToken: string;
  
  /** Port for health endpoint */
  healthPort: number;
  
  /** Notification poll interval (ms) */
  deliveryInterval: number;
  
  /** Health check interval to Convex (ms) */
  healthCheckInterval: number;
}

export function loadConfig(): RuntimeConfig {
  const accountId = process.env.ACCOUNT_ID;
  const convexUrl = process.env.CONVEX_URL;
  const serviceToken = process.env.SERVICE_TOKEN;
  
  if (!accountId || !convexUrl || !serviceToken) {
    throw new Error("Missing required environment variables");
  }
  
  return {
    accountId: accountId as Id<"accounts">,
    convexUrl,
    serviceToken,
    healthPort: parseInt(process.env.HEALTH_PORT || "3001"),
    deliveryInterval: parseInt(process.env.DELIVERY_INTERVAL || "5000"),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || "60000"),
  };
}
```

---

## 5. Convex Client Setup

```typescript
// apps/runtime/src/convex-client.ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "@packages/backend/convex/_generated/api";
import { RuntimeConfig } from "./config";

let client: ConvexHttpClient;

export function initConvexClient(config: RuntimeConfig): ConvexHttpClient {
  client = new ConvexHttpClient(config.convexUrl);
  return client;
}

export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    throw new Error("Convex client not initialized");
  }
  return client;
}

export { api };
```

---

## 6. Notification Delivery Loop

```typescript
// apps/runtime/src/delivery.ts
import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import { sendToOpenClaw } from "./gateway";

interface DeliveryState {
  isRunning: boolean;
  lastDelivery: number | null;
  deliveredCount: number;
  failedCount: number;
}

const state: DeliveryState = {
  isRunning: false,
  lastDelivery: null,
  deliveredCount: 0,
  failedCount: 0,
};

/**
 * Start the notification delivery loop.
 * Polls Convex for undelivered agent notifications and delivers to OpenClaw.
 */
export function startDeliveryLoop(config: RuntimeConfig): void {
  if (state.isRunning) return;
  state.isRunning = true;
  
  console.log("[Delivery] Starting delivery loop...");
  
  const poll = async () => {
    if (!state.isRunning) return;
    
    try {
      const client = getConvexClient();
      
      // Fetch undelivered notifications
      const notifications = await client.query(
        api.service.notifications.listUndeliveredForAccount,
        { accountId: config.accountId, limit: 50 }
      );
      
      if (notifications.length > 0) {
        console.log(`[Delivery] Found ${notifications.length} notifications to deliver`);
      }
      
      // Deliver each notification
      for (const notification of notifications) {
        try {
          // Get full notification context
          const context = await client.query(
            api.service.notifications.getForDelivery,
            { notificationId: notification._id }
          );
          
          if (context?.agent) {
            // Send to OpenClaw session
            await sendToOpenClaw(
              context.agent.sessionKey,
              formatNotificationMessage(context)
            );
            
            // Mark as delivered
            await client.mutation(
              api.service.notifications.markDelivered,
              { notificationId: notification._id }
            );
            
            state.deliveredCount++;
            console.log(`[Delivery] Delivered notification ${notification._id}`);
          }
        } catch (error) {
          state.failedCount++;
          console.error(`[Delivery] Failed to deliver ${notification._id}:`, error);
          // Don't mark as delivered - will retry on next poll
        }
      }
      
      state.lastDelivery = Date.now();
    } catch (error) {
      console.error("[Delivery] Poll error:", error);
    }
    
    // Schedule next poll
    setTimeout(poll, config.deliveryInterval);
  };
  
  poll();
}

export function stopDeliveryLoop(): void {
  state.isRunning = false;
  console.log("[Delivery] Stopped delivery loop");
}

export function getDeliveryState(): DeliveryState {
  return { ...state };
}

function formatNotificationMessage(context: any): string {
  const { notification, task } = context;
  
  return `
## Notification: ${notification.type}

**${notification.title}**

${notification.body}

${task ? `Task: ${task.title} (${task.status})` : ""}

---
Notification ID: ${notification._id}
`.trim();
}
```

---

## 7. OpenClaw Gateway Integration

```typescript
// apps/runtime/src/gateway.ts
import { RuntimeConfig } from "./config";
import { getConvexClient, api } from "./convex-client";

interface GatewayState {
  isRunning: boolean;
  sessions: Map<string, SessionInfo>;
}

interface SessionInfo {
  sessionKey: string;
  agentId: string;
  lastMessage: number | null;
}

const state: GatewayState = {
  isRunning: false,
  sessions: new Map(),
};

/**
 * Initialize the OpenClaw gateway.
 * In production, this would start the actual OpenClaw gateway process.
 */
export async function initGateway(config: RuntimeConfig): Promise<void> {
  console.log("[Gateway] Initializing OpenClaw gateway...");
  
  // Fetch agents for this account
  const client = getConvexClient();
  const agents = await client.query(api.agents.list, { 
    accountId: config.accountId 
  });
  
  // Register sessions for each agent
  for (const agent of agents) {
    state.sessions.set(agent.sessionKey, {
      sessionKey: agent.sessionKey,
      agentId: agent._id,
      lastMessage: null,
    });
    
    console.log(`[Gateway] Registered session: ${agent.sessionKey}`);
  }
  
  state.isRunning = true;
  
  // TODO: Start actual OpenClaw gateway
  // This would involve:
  // 1. clawdbot gateway start
  // 2. Register sessions with proper SOUL files
  // 3. Set up message handlers
  
  console.log(`[Gateway] Initialized with ${state.sessions.size} sessions`);
}

/**
 * Send a message to an OpenClaw session.
 */
export async function sendToOpenClaw(
  sessionKey: string, 
  message: string
): Promise<void> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }
  
  console.log(`[Gateway] Sending to ${sessionKey}:`, message.substring(0, 100));
  
  // TODO: Actual OpenClaw message send
  // This would use the OpenClaw SDK/CLI:
  // clawdbot session send --key {sessionKey} --message "{message}"
  
  session.lastMessage = Date.now();
}

/**
 * Receive a response from an OpenClaw session.
 * Called by OpenClaw webhook/callback.
 */
export async function receiveFromOpenClaw(
  sessionKey: string,
  response: string,
  taskId?: string
): Promise<void> {
  const session = state.sessions.get(sessionKey);
  if (!session) {
    throw new Error(`Unknown session: ${sessionKey}`);
  }
  
  console.log(`[Gateway] Received from ${sessionKey}:`, response.substring(0, 100));
  
  // Post response as message in Convex
  const client = getConvexClient();
  
  if (taskId) {
    await client.mutation(api.service.messages.createFromAgent, {
      agentId: session.agentId as any,
      taskId: taskId as any,
      content: response,
    });
  }
}

export function getGatewayState(): GatewayState {
  return {
    isRunning: state.isRunning,
    sessions: new Map(state.sessions),
  };
}

export async function shutdownGateway(): Promise<void> {
  state.isRunning = false;
  state.sessions.clear();
  
  // TODO: Graceful OpenClaw shutdown
  // clawdbot gateway stop
  
  console.log("[Gateway] Shutdown complete");
}
```

---

## 8. Heartbeat Scheduler

```typescript
// apps/runtime/src/heartbeat.ts
import { getConvexClient, api } from "./convex-client";
import { RuntimeConfig } from "./config";
import { sendToOpenClaw } from "./gateway";

interface HeartbeatState {
  isRunning: boolean;
  schedules: Map<string, NodeJS.Timeout>;
}

const state: HeartbeatState = {
  isRunning: false,
  schedules: new Map(),
};

/**
 * Start heartbeat scheduling for all agents.
 */
export async function startHeartbeats(config: RuntimeConfig): Promise<void> {
  console.log("[Heartbeat] Starting heartbeat scheduler...");
  
  const client = getConvexClient();
  const agents = await client.query(api.agents.list, { 
    accountId: config.accountId 
  });
  
  for (const agent of agents) {
    scheduleHeartbeat(agent, config);
  }
  
  state.isRunning = true;
  console.log(`[Heartbeat] Scheduled ${agents.length} agents`);
}

function scheduleHeartbeat(agent: any, config: RuntimeConfig): void {
  // Stagger heartbeats to avoid spikes
  const intervalMs = agent.heartbeatInterval * 60 * 1000;
  const jitter = Math.random() * 60 * 1000; // Up to 1 minute jitter
  
  const execute = async () => {
    try {
      console.log(`[Heartbeat] Executing for ${agent.name}`);
      
      // Send heartbeat message to agent
      const heartbeatMessage = `
## Heartbeat Check

Execute your heartbeat protocol:
1. Check for assigned tasks
2. Check for unread mentions
3. Review activity feed
4. Take one action if appropriate
5. Report status

Current time: ${new Date().toISOString()}
`.trim();
      
      await sendToOpenClaw(agent.sessionKey, heartbeatMessage);
      
      // Update heartbeat status in Convex
      const client = getConvexClient();
      await client.mutation(api.service.agents.upsertHeartbeat, {
        agentId: agent._id,
        status: "online",
      });
      
    } catch (error) {
      console.error(`[Heartbeat] Failed for ${agent.name}:`, error);
    }
    
    // Schedule next heartbeat
    if (state.isRunning) {
      const timeout = setTimeout(execute, intervalMs);
      state.schedules.set(agent._id, timeout);
    }
  };
  
  // Start with jittered delay
  const timeout = setTimeout(execute, jitter);
  state.schedules.set(agent._id, timeout);
}

export function stopHeartbeats(): void {
  state.isRunning = false;
  
  for (const timeout of state.schedules.values()) {
    clearTimeout(timeout);
  }
  
  state.schedules.clear();
  console.log("[Heartbeat] Stopped all heartbeats");
}
```

---

## 9. Health Check Endpoint

```typescript
// apps/runtime/src/health.ts
import http from "http";
import { RuntimeConfig } from "./config";
import { getDeliveryState } from "./delivery";
import { getGatewayState } from "./gateway";
import { getConvexClient, api } from "./convex-client";

let server: http.Server;

/**
 * Start health check HTTP endpoint.
 */
export function startHealthServer(config: RuntimeConfig): void {
  server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      const delivery = getDeliveryState();
      const gateway = getGatewayState();
      
      const health = {
        status: gateway.isRunning && delivery.isRunning ? "healthy" : "degraded",
        uptime: process.uptime(),
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
        timestamp: Date.now(),
      };
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
  
  server.listen(config.healthPort, () => {
    console.log(`[Health] Server listening on port ${config.healthPort}`);
  });
  
  // Periodic health check to Convex
  setInterval(async () => {
    try {
      const client = getConvexClient();
      await client.mutation(api.accounts.updateRuntimeStatus, {
        accountId: config.accountId,
        status: "online",
        config: {
          dropletId: process.env.DROPLET_ID || "unknown",
          ipAddress: process.env.DROPLET_IP || "unknown",
          lastHealthCheck: Date.now(),
        },
      });
    } catch (error) {
      console.error("[Health] Failed to update Convex status:", error);
    }
  }, config.healthCheckInterval);
}

export function stopHealthServer(): void {
  server?.close();
}
```

---

## 10. Main Entry Point

```typescript
// apps/runtime/src/index.ts
import { loadConfig } from "./config";
import { initConvexClient } from "./convex-client";
import { initGateway, shutdownGateway } from "./gateway";
import { startDeliveryLoop, stopDeliveryLoop } from "./delivery";
import { startHeartbeats, stopHeartbeats } from "./heartbeat";
import { startHealthServer, stopHealthServer } from "./health";

async function main() {
  console.log("=== Mission Control Runtime Service ===");
  
  // Load configuration
  const config = loadConfig();
  console.log(`Account ID: ${config.accountId}`);
  
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

async function shutdown() {
  console.log("\nShutting down...");
  
  stopDeliveryLoop();
  stopHeartbeats();
  await shutdownGateway();
  stopHealthServer();
  
  // Mark as offline in Convex
  try {
    const config = loadConfig();
    const client = getConvexClient();
    await client.mutation(api.accounts.updateRuntimeStatus, {
      accountId: config.accountId,
      status: "offline",
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
```

---

## 11. Dockerfile

```dockerfile
# apps/runtime/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install OpenClaw CLI
RUN npm install -g @openclaw/cli

# Copy workspace files
COPY package.json yarn.lock ./
COPY apps/runtime/package.json ./apps/runtime/
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN yarn install --frozen-lockfile --production

# Copy source
COPY apps/runtime ./apps/runtime
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Build
WORKDIR /app/apps/runtime
RUN yarn build

# Environment
ENV NODE_ENV=production
ENV HEALTH_PORT=3001

EXPOSE 3001

# Run
CMD ["node", "dist/index.js"]
```

---

## 12. TODO Checklist

- [ ] Create config.ts
- [ ] Create convex-client.ts
- [ ] Create gateway.ts
- [ ] Create delivery.ts
- [ ] Create heartbeat.ts
- [ ] Create health.ts
- [ ] Update index.ts entry point
- [ ] Update Dockerfile
- [ ] Test locally with mock OpenClaw
- [ ] Document deployment to DigitalOcean
- [ ] Commit changes

---

## Completion Criteria

1. Runtime service starts and connects to Convex
2. Notification delivery loop works
3. Health endpoint responds
4. Docker build succeeds
5. Can be deployed to DigitalOcean Droplet
