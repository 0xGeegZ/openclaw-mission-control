#!/usr/bin/env bash
# Local upgrade helper for Mission Control runtime stack.
# Uses docker compose pull / down / up as in docs/roadmap/runtime-version-management-v2.md.
# Run from repo root. Requires docker compose and apps/runtime/.env.

set -e

COMPOSE_FILE="${COMPOSE_FILE:-apps/runtime/docker-compose.runtime.yml}"
PROFILE="${PROFILE:-}"
DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-0}"
COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-0}"

export DOCKER_BUILDKIT COMPOSE_DOCKER_CLI_BUILD

cd "$(dirname "$0")/.."

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: $COMPOSE_FILE not found. Run from repo root." >&2
  exit 1
fi

if [ ! -f apps/runtime/.env ]; then
  echo "Warning: apps/runtime/.env not found. Create from apps/runtime/.env.example" >&2
fi

echo "Pulling latest images..."
docker compose -f "$COMPOSE_FILE" ${PROFILE:+--profile "$PROFILE"} pull

echo "Stopping services..."
docker compose -f "$COMPOSE_FILE" ${PROFILE:+--profile "$PROFILE"} down

echo "Starting services..."
docker compose -f "$COMPOSE_FILE" ${PROFILE:+--profile "$PROFILE"} up -d

echo "Done. Check health: curl -s http://127.0.0.1:3001/health"
