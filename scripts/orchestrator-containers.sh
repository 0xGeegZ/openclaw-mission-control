#!/bin/bash
# Container Orchestration Script
# Manages Docker container lifecycle for per-customer isolation
# Usage: orchestrator-containers.sh <action> <customer-id> [port] [plan]

set -e

ACTION="${1:-}"
CUSTOMER_ID="${2:-}"
PORT="${3:-5000}"
PLAN="${4:-starter}"
COMPOSE_DIR="/var/lib/openclaw/containers"
NETWORK_PREFIX="mission-control-network"
IMAGE="${OPENCLAW_IMAGE:-openclaw-mission-control:latest}"
HEALTH_CHECK_INTERVAL=30
HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_TIMEOUT=5
AUTO_RESTART_THRESHOLD=3

# Logging
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$ACTION] $*" >&2
}

error() {
  log "ERROR: $*"
  exit 1
}

validate_args() {
  if [[ -z "$ACTION" ]]; then
    error "Missing ACTION (create|delete|restart|health-check)"
  fi
  if [[ -z "$CUSTOMER_ID" ]] && [[ "$ACTION" != "health-check" ]]; then
    error "Missing CUSTOMER_ID (except for health-check action)"
  fi
}

ensure_directories() {
  mkdir -p "$COMPOSE_DIR"
  mkdir -p "/var/log/openclaw/containers"
}

generate_docker_compose() {
  local customer_id="$1"
  local port="$2"
  local plan="$3"
  local compose_file="$COMPOSE_DIR/docker-compose-${customer_id}.yml"

  # Determine resource limits based on plan
  local cpus memory
  case "$plan" in
    starter)
      cpus="0.5"
      memory="512M"
      ;;
    pro)
      cpus="1.0"
      memory="1024M"
      ;;
    enterprise)
      cpus="2.0"
      memory="2048M"
      ;;
    *)
      error "Unknown plan: $plan"
      ;;
  esac

  cat > "$compose_file" << EOF
version: '3.9'

services:
  customer-${customer_id}:
    image: ${IMAGE}
    container_name: customer-${customer_id}
    environment:
      - CUSTOMER_ID=${customer_id}
      - CONVEX_DEPLOYMENT_URL=\${CONVEX_DEPLOYMENT_URL}
      - DATABASE_URL=\${DATABASE_URL}
      - NODE_ENV=production
    ports:
      - "${port}:3000"
    networks:
      - ${NETWORK_PREFIX}-${customer_id}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: ${HEALTH_CHECK_INTERVAL}s
      timeout: ${HEALTH_CHECK_TIMEOUT}s
      retries: ${HEALTH_CHECK_RETRIES}
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '${cpus}'
          memory: '${memory}'
        reservations:
          cpus: '$((${cpus} / 2))'
          memory: '$((${memory} / 2))'
    restart_policy:
      condition: on-failure
      delay: 5s
      max_attempts: 5
    labels:
      - "openclaw.customer=${customer_id}"
      - "openclaw.plan=${plan}"
      - "openclaw.port=${port}"

networks:
  ${NETWORK_PREFIX}-${customer_id}:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
EOF

  log "Generated docker-compose for customer $customer_id at $compose_file"
  echo "$compose_file"
}

create_container() {
  local customer_id="$1"
  local port="$2"
  local plan="$3"

  log "Creating container for customer $customer_id on port $port (plan: $plan)"

  # Generate docker-compose file
  local compose_file
  compose_file=$(generate_docker_compose "$customer_id" "$port" "$plan")

  # Create isolated network
  local network_name="${NETWORK_PREFIX}-${customer_id}"
  if docker network ls --format '{{.Name}}' | grep -q "^${network_name}\$"; then
    log "Network $network_name already exists"
  else
    docker network create "$network_name" --subnet=172.25.0.0/16 2>/dev/null || log "Network creation skipped (may already exist)"
  fi

  # Start container via docker-compose
  cd "$(dirname "$compose_file")" || error "Cannot cd to compose directory"
  docker-compose -f "$(basename "$compose_file")" up -d || error "Failed to start container"

  # Wait for healthcheck
  log "Waiting for container to be healthy..."
  local retries=0
  local max_retries=30
  while [[ $retries -lt $max_retries ]]; do
    if docker-compose -f "$(basename "$compose_file")" ps | grep -q "healthy"; then
      log "Container is healthy"
      return 0
    fi
    retries=$((retries + 1))
    sleep 1
  done

  error "Container failed to become healthy within ${max_retries}s"
}

delete_container() {
  local customer_id="$1"

  log "Deleting container for customer $customer_id"

  local compose_file="$COMPOSE_DIR/docker-compose-${customer_id}.yml"
  if [[ ! -f "$compose_file" ]]; then
    error "Compose file not found: $compose_file"
  fi

  # Stop container
  cd "$(dirname "$compose_file")" || error "Cannot cd to compose directory"
  docker-compose -f "$(basename "$compose_file")" down || error "Failed to stop container"

  # Remove network
  local network_name="${NETWORK_PREFIX}-${customer_id}"
  docker network rm "$network_name" 2>/dev/null || log "Network removal (may not exist or already deleted)"

  # Remove compose file
  rm -f "$compose_file"
  log "Deleted container and cleanup completed"
}

restart_container() {
  local customer_id="$1"

  log "Restarting container for customer $customer_id"

  local compose_file="$COMPOSE_DIR/docker-compose-${customer_id}.yml"
  if [[ ! -f "$compose_file" ]]; then
    error "Compose file not found: $compose_file"
  fi

  cd "$(dirname "$compose_file")" || error "Cannot cd to compose directory"
  docker-compose -f "$(basename "$compose_file")" restart || error "Failed to restart container"

  # Wait for healthcheck
  log "Waiting for restarted container to be healthy..."
  local retries=0
  local max_retries=30
  while [[ $retries -lt $max_retries ]]; do
    if docker-compose -f "$(basename "$compose_file")" ps | grep -q "healthy"; then
      log "Restarted container is healthy"
      return 0
    fi
    retries=$((retries + 1))
    sleep 1
  done

  error "Restarted container failed to become healthy within ${max_retries}s"
}

health_check_all() {
  log "Running health checks for all containers"

  # Get all running containers with openclaw labels
  local containers
  containers=$(docker ps --filter "label=openclaw.customer" --format "{{.Labels}}" 2>/dev/null || echo "")

  if [[ -z "$containers" ]]; then
    log "No containers found"
    return 0
  fi

  while IFS= read -r labels; do
    # Extract customer_id from labels (format: openclaw.customer=<id>,...)
    local customer_id
    customer_id=$(echo "$labels" | grep -oP '(?<=openclaw\.customer=)[^,]*' | head -1)
    if [[ -z "$customer_id" ]]; then
      continue
    fi

    # Extract port from labels
    local port
    port=$(echo "$labels" | grep -oP '(?<=openclaw\.port=)[^,]*' | head -1)
    if [[ -z "$port" ]]; then
      continue
    fi

    # Perform health check
    if curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
      log "Health check PASSED for customer $customer_id (port $port)"
    else
      log "Health check FAILED for customer $customer_id (port $port)"
      # Note: Auto-restart logic is handled by Docker's restart_policy
      # Further orchestration can be implemented here or in Convex mutation
    fi
  done < <(echo "$containers")
}

main() {
  validate_args
  ensure_directories

  case "$ACTION" in
    create)
      create_container "$CUSTOMER_ID" "$PORT" "$PLAN"
      ;;
    delete)
      delete_container "$CUSTOMER_ID"
      ;;
    restart)
      restart_container "$CUSTOMER_ID"
      ;;
    health-check)
      health_check_all
      ;;
    *)
      error "Unknown action: $ACTION (create|delete|restart|health-check)"
      ;;
  esac

  log "Action completed successfully"
}

main
