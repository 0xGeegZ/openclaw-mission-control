# Phase 1B: Container Orchestration — Implementation Guide

## Overview

Phase 1B implements the Docker container orchestration layer that handles per-customer container lifecycle: creation, deletion, restart, and health monitoring.

**Key Components:**
- `orchestrator-containers.sh` — Main orchestration script (create/delete/restart/health-check)
- Health check daemon — Runs health checks every 30 seconds via systemd timer
- Docker Compose templates — Per-customer isolation with resource limits
- Convex mutations — Async orchestration calls (integrated in Phase 1B)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Convex Mutations (Backend)                                   │
│  ├─ createContainer()                                       │
│  ├─ deleteContainer()                                       │
│  ├─ restartContainer()                                      │
│  └─ updateContainerHealthStatus()                           │
└────────────────┬────────────────────────────────────────────┘
                 │ (spawn async)
┌────────────────┴────────────────────────────────────────────┐
│ orchestrator-containers.sh                                  │
│  ├─ create: Generate docker-compose + start container      │
│  ├─ delete: Stop + cleanup docker resources                │
│  ├─ restart: Restart container + wait for health           │
│  └─ health-check: Query all containers + curl health       │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────────────────┐
│ systemd Timer + Service                                      │
│  └─ openclaw-health-check.timer (every 30s)                │
│     └─ openclaw-health-check.service (runs health-check)   │
└──────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### 1. Deploy Orchestrator Script

```bash
# Copy scripts to host
sudo mkdir -p /opt/openclaw
sudo cp scripts/orchestrator-containers.sh /opt/openclaw/
sudo chmod +x /opt/openclaw/orchestrator-containers.sh

# Create data directory
sudo mkdir -p /var/lib/openclaw/containers
sudo chown root:root /var/lib/openclaw/containers
sudo chmod 755 /var/lib/openclaw/containers

# Create log directory
sudo mkdir -p /var/log/openclaw/containers
sudo chown root:root /var/log/openclaw/containers
sudo chmod 755 /var/log/openclaw/containers
```

### 2. Setup Health Check Daemon

```bash
# Copy health check helper
sudo cp scripts/openclaw-health-check /usr/local/bin/
sudo chmod +x /usr/local/bin/openclaw-health-check

# Install systemd service files
sudo cp scripts/openclaw-health-check.service /etc/systemd/system/
sudo cp scripts/openclaw-health-check.timer /etc/systemd/system/

# Enable and start timer
sudo systemctl daemon-reload
sudo systemctl enable openclaw-health-check.timer
sudo systemctl start openclaw-health-check.timer

# Verify
sudo systemctl status openclaw-health-check.timer
sudo systemctl list-timers openclaw-health-check.timer
```

### 3. Environment Configuration

Create `/etc/openclaw/orchestration.env`:

```bash
# Docker image for containers
OPENCLAW_IMAGE=openclaw-mission-control:latest

# Health check settings
HEALTH_CHECK_INTERVAL=30       # seconds between health checks
HEALTH_CHECK_RETRIES=3         # curl retry count
HEALTH_CHECK_TIMEOUT=5         # seconds to wait for response
AUTO_RESTART_THRESHOLD=3       # consecutive failures before restart

# Compose file directory
COMPOSE_DIR=/var/lib/openclaw/containers

# Logging
LOG_DIR=/var/log/openclaw/containers
```

Load in orchestrator script:
```bash
source /etc/openclaw/orchestration.env || true
```

### 4. Convex Integration

The Convex mutations in `packages/backend/convex/containers.ts` handle the control plane logic:

```typescript
// Example: Create container mutation
export const createContainer = internalMutation({
  args: {
    accountId: v.id("accounts"),
    plan: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Allocate port and create Convex record
    const assignedPort = await getNextAvailablePort(ctx);
    const containerId = await ctx.db.insert("containers", {
      accountId: args.accountId,
      containerName: `customer-${args.accountId.slice(0, 8)}`,
      status: "creating",
      assignedPort,
      // ...
    });

    // 2. Phase 1B: Spawn async orchestration
    // orchestrator-containers.sh create {accountId} {assignedPort} {plan}
    await ctx.scheduler.runAfter(0, internal.orchestration.executeCreate, {
      accountId: args.accountId,
      containerId,
      assignedPort,
      plan: args.plan,
    });

    return { containerId, status: "creating", assignedPort };
  },
});
```

**Note:** `ctx.scheduler` integration will be added in a separate commit to decouple orchestration calls from Convex DB writes.

## Orchestrator Script Usage

### Create Container

```bash
orchestrator-containers.sh create <customer-id> <port> <plan>

# Example
/opt/openclaw/orchestrator-containers.sh create abc123def456 5001 starter
```

**Effects:**
- Generates docker-compose file at `/var/lib/openclaw/containers/docker-compose-abc123def456.yml`
- Creates isolated Docker network: `mission-control-network-abc123def456`
- Starts container with resource limits per plan (starter: 0.5 CPU, 512M RAM)
- Waits for healthcheck to pass (curl http://localhost:5001/health)
- On failure: exits with error code, Convex record remains status="creating" (can retry)

### Delete Container

```bash
orchestrator-containers.sh delete <customer-id>

# Example
/opt/openclaw/orchestrator-containers.sh delete abc123def456
```

**Effects:**
- Stops docker-compose containers
- Removes isolated network
- Deletes compose file
- Updates Convex record to status="deleted"

### Restart Container

```bash
orchestrator-containers.sh restart <customer-id>

# Example
/opt/openclaw/orchestrator-containers.sh restart abc123def456
```

**Effects:**
- Restarts docker-compose service
- Resets health check counter
- Waits for healthcheck (same as create)

### Health Check

```bash
orchestrator-containers.sh health-check
```

**Effects:**
- Queries Docker for all containers with label `openclaw.customer`
- For each, curls `http://localhost:{port}/health`
- Logs results (passed/failed)
- On consecutive failures: Docker's `restart_policy` triggers auto-restart
- Convex is updated via a separate mutation call from health check daemon

## Docker Compose Template

Per-customer docker-compose files are generated dynamically:

```yaml
version: '3.9'

services:
  customer-abc123def456:
    image: openclaw-mission-control:latest
    container_name: customer-abc123def456
    environment:
      - CUSTOMER_ID=abc123def456
      - CONVEX_DEPLOYMENT_URL=...
      - DATABASE_URL=...
      - NODE_ENV=production
    ports:
      - "5001:3000"
    networks:
      - mission-control-network-abc123def456
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: '512M'
        reservations:
          cpus: '0.25'
          memory: '256M'
    restart_policy:
      condition: on-failure
      delay: 5s
      max_attempts: 5
    labels:
      - "openclaw.customer=abc123def456"
      - "openclaw.plan=starter"
      - "openclaw.port=5001"

networks:
  mission-control-network-abc123def456:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
```

**Key Features:**
- **Isolation:** Dedicated network per customer (containers can't reach each other)
- **Resource limits:** CPU and memory quotas per plan
- **Health checks:** 30-second interval, auto-restart on failure
- **Labels:** Metadata for orchestrator script to identify and manage containers

## Monitoring & Troubleshooting

### View Health Check Logs

```bash
# Real-time
sudo journalctl -u openclaw-health-check.timer -f

# Last 50 entries
sudo journalctl -u openclaw-health-check.service -n 50
```

### View Container Logs

```bash
# List all containers
docker ps -a --filter label=openclaw.customer

# View specific container logs
docker logs customer-abc123def456

# Follow logs
docker logs -f customer-abc123def456
```

### Check Health Check Status

```bash
# View next scheduled run
sudo systemctl list-timers openclaw-health-check.timer

# Run health check manually
sudo /opt/openclaw/orchestrator-containers.sh health-check

# View last run
sudo journalctl -u openclaw-health-check.service -n 1 --no-pager
```

### Verify Network Isolation

```bash
# List networks
docker network ls

# Inspect network
docker network inspect mission-control-network-abc123def456

# Test isolation (should fail)
docker exec customer-abc123def456 ping customer-other-id
```

### Port Conflict Resolution

```bash
# Check port usage
sudo netstat -tlnp | grep 5000

# Find container using port
docker ps --filter publish=5000

# Free up port (force stop container)
docker stop customer-abc123def456
docker system prune -af
```

## Health Check Daemon Flow

1. **Timer fires every 30 seconds**
   - systemd activates `openclaw-health-check.service`
   - Calls `/usr/local/bin/openclaw-health-check`

2. **Health check script runs**
   - Calls `/opt/openclaw/orchestrator-containers.sh health-check`
   - Queries Docker for all containers with `openclaw.customer` label
   - For each running container, curls `/health` endpoint on assigned port

3. **Results logged**
   - Successful: "Health check PASSED for customer {id} (port {port})"
   - Failed: "Health check FAILED for customer {id} (port {port})"

4. **Docker handles auto-restart**
   - Failure counter managed by Docker's `healthcheck` config
   - After 3 consecutive failures + 5s delay: container restarts
   - Max 5 restart attempts before giving up

5. **Convex sync (Phase 1B follow-up)**
   - Daemon calls Convex mutations to log results
   - Updates `lastHealthCheck` timestamp
   - Updates `healthChecksPassed` counter
   - Marks container as "failed" if threshold exceeded

## Idempotency & Safety

**All orchestrator operations are idempotent:**

- **Create:** If container already exists, docker-compose up -d is safe (no-op)
- **Delete:** Safe to call multiple times (handles missing files/networks gracefully)
- **Restart:** Safe to call on any container state
- **Health-check:** Read-only operation, can run anytime

**Error handling:**

- Failed create → Convex record stays "creating" (can manually retry or delete)
- Failed delete → Record stays "deleted" (cleanup can be retried)
- Failed health check → Docker's restart_policy takes over (no manual intervention needed)

## Performance Considerations

| Operation | Time | Notes |
|-----------|------|-------|
| Create container | 10–15s | Includes wait for healthcheck |
| Delete container | 2–5s | Docker shutdown + cleanup |
| Restart container | 5–10s | Includes healthcheck verification |
| Health check (all) | <1s per container | 30s interval, parallel curls possible |

**Scaling limits (single VPS):**
- Port range: 5000–15000 = 10k containers max
- CPU/memory: Depends on plan tier + hardware (4vCPU/8GB handles ~50 starter containers)

## Future Enhancements

**Phase 1B follow-ups:**
- Convex `ctx.scheduler` integration for async operations
- Graceful shutdown with connection draining
- Container metrics collection (CPU, memory, network)
- Automated backups before container restart
- Rate limiting on create/delete operations

**Phase 2+:**
- Multi-host orchestration (Kubernetes migration)
- Advanced health checks (custom endpoints, timeouts)
- Container log aggregation (ELK stack, CloudWatch)
- Resource auto-scaling based on demand
- Container upgrade/rollback orchestration

## References

- Docker Compose: https://docs.docker.com/compose/
- systemd Timers: https://www.freedesktop.org/software/systemd/man/systemd.timer.html
- Docker Healthcheck: https://docs.docker.com/engine/reference/builder/#healthcheck
- Phase 1.1 Plan: [/deliverables/PLAN_PHASE_1_1_CONTAINER_ORCHESTRATION.md](/deliverables/PLAN_PHASE_1_1_CONTAINER_ORCHESTRATION.md)
