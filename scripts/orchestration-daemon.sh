#!/bin/bash
# Container Orchestration Daemon
# Monitors Convex DB for container lifecycle operations and executes orchestration scripts
# Polls every 5 seconds for pending operations

set -e

ORCHESTRATOR="/opt/openclaw/orchestrator-containers.sh"
COMPOSE_DIR="/var/lib/openclaw/containers"
POLL_INTERVAL=5
LOG_FILE="/var/log/openclaw/orchestration-daemon.log"

log() {
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$timestamp] $*" >> "$LOG_FILE"
  echo "[$timestamp] $*" >&2
}

error() {
  log "ERROR: $*"
  exit 1
}

ensure_directories() {
  mkdir -p "$COMPOSE_DIR"
  mkdir -p "$(dirname "$LOG_FILE")"
}

validate_orchestrator() {
  if [[ ! -x "$ORCHESTRATOR" ]]; then
    error "Orchestrator script not found or not executable: $ORCHESTRATOR"
  fi
}

# Process pending container operations from Convex
# This would typically use Convex HTTP API or a message queue
# For now, this is a placeholder that demonstrates the flow
process_pending_operations() {
  log "Polling for pending container operations..."
  
  # In a production setup, this would:
  # 1. Query Convex for containers with status="creating" or "failed"
  # 2. Call orchestrator script with appropriate action
  # 3. Update Convex with result (running, failed, etc.)
  #
  # Simplified flow (requires external integration):
  # local response=$(curl -s -H "Authorization: Bearer $CONVEX_TOKEN" \
  #   "https://$CONVEX_DEPLOYMENT_URL/api/query" \
  #   -d '{"path":"containers:getContainersByStatus", "args":{"status":"creating"}}')
  #
  # For MVP, this daemon serves as a template for integrating
  # Convex operations with shell scripts.
  
  :
}

# Watch Docker events and sync back to Convex
watch_docker_events() {
  log "Starting Docker event watcher..."
  
  docker events --filter type=container --format '{{json .}}' | while read -r event; do
    log "Docker event: $event"
    
    # Extract container name and action
    local container
    container=$(echo "$event" | grep -oP '(?<="name":")[^"]+' | head -1)
    local action
    action=$(echo "$event" | grep -oP '(?<="Type":")[^"]+' | head -1)
    
    if [[ "$action" == "start" ]] || [[ "$action" == "stop" ]]; then
      log "Container $container action: $action"
      # Would sync back to Convex here
    fi
  done
}

# Cleanup function for graceful shutdown
cleanup() {
  log "Orchestration daemon shutting down..."
  exit 0
}

trap cleanup SIGTERM SIGINT

main() {
  ensure_directories
  validate_orchestrator
  
  log "Orchestration daemon started (PID: $$)"
  log "Poll interval: ${POLL_INTERVAL}s"
  
  # Main loop
  while true; do
    process_pending_operations
    watch_docker_events &
    sleep "$POLL_INTERVAL"
  done
}

main
