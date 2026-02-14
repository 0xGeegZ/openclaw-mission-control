#!/usr/bin/env bash
# Local helper for docker compose up (runtime + optional OpenClaw).
# Defaults to BuildKit off to avoid Docker Desktop snapshotter issues.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-apps/runtime/docker-compose.runtime.yml}"
PROFILE="${PROFILE:-}"
DAEMON="${DAEMON:-0}"
BUILD="${BUILD:-1}"
PRUNE_ON_FAIL="${PRUNE_ON_FAIL:-1}"

DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-0}"
COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-0}"

export DOCKER_BUILDKIT COMPOSE_DOCKER_CLI_BUILD

cd "$(dirname "$0")/.."

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: $COMPOSE_FILE not found. Run from repo root." >&2
  exit 1
fi

compose_args=( -f "$COMPOSE_FILE" )
if [ -n "$PROFILE" ]; then
  compose_args+=( --profile "$PROFILE" )
fi

# Run runtime as host user so the bind mount is writable without sudo.
export DOCKER_UID="${DOCKER_UID:-$(id -u)}"
export DOCKER_GID="${DOCKER_GID:-$(id -g)}"
mkdir -p .runtime/openclaw-workspace .runtime/openclaw-data
# Ensure workspace is owned by host user (runtime container runs as DOCKER_UID:DOCKER_GID).
if ! chown -R "${DOCKER_UID}:${DOCKER_GID}" .runtime/openclaw-workspace 2>/dev/null; then
  sudo chown -R "${DOCKER_UID}:${DOCKER_GID}" .runtime/openclaw-workspace 2>/dev/null || true
fi
# Writable by gateway (root) when it touches MEMORY.md etc.
if ! chmod -R a+rwX .runtime/openclaw-workspace 2>/dev/null; then
  sudo chmod -R a+rwX .runtime/openclaw-workspace 2>/dev/null || true
fi

# Clean up any leftover containers/networks from a previous failed run to avoid
# "network ... not found" when Docker has stale references (common on macOS).
docker compose "${compose_args[@]}" down --remove-orphans 2>/dev/null || true

up_args=( up )
if [ "$DAEMON" = "1" ]; then
  up_args+=( -d )
fi
if [ "$BUILD" = "1" ]; then
  up_args+=( --build )
fi

run_compose() {
  docker compose "${compose_args[@]}" "${up_args[@]}"
}

if run_compose; then
  exit 0
fi

if [ "$PRUNE_ON_FAIL" = "1" ]; then
  echo "Docker compose failed. Pruning build cache and retrying..." >&2
  docker builder prune -f || true
  if run_compose; then
    exit 0
  fi
fi

cat <<'EOF' >&2
Docker compose failed.
- If you see "failed to set up container networking: network ... not found": from repo root run
  "docker compose -f apps/runtime/docker-compose.runtime.yml down --remove-orphans" (or from apps/runtime: "npm run docker:down"),
  then restart Docker Desktop and retry.
- If you see containerd-stargz snapshotter errors on macOS: restart Docker Desktop, or disable
  "Use containerd for pulling and storing images" in Docker Desktop > Settings > Features in development.

Then rerun from apps/runtime: npm run docker:up (runtime only) or npm run docker:up:openclaw (with gateway).
EOF
exit 1
