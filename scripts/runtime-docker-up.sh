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
Docker build failed.
If you see containerd-stargz snapshotter errors on macOS:
- Restart Docker Desktop, then retry
- Or disable "Use containerd for pulling and storing images" in Docker Desktop > Settings > Features in development

Then rerun the command.
EOF
exit 1
