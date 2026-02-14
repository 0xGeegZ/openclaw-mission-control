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

# Run runtime as host user so the bind mount is writable (Docker Desktop Mac preserves host UID in the mount).
DOCKER_UID="${DOCKER_UID:-$(id -u 2>/dev/null)}"
DOCKER_GID="${DOCKER_GID:-$(id -g 2>/dev/null)}"
if [ -z "$DOCKER_UID" ] || [ -z "$DOCKER_GID" ]; then
  echo "Error: could not get current user id. Set DOCKER_UID and DOCKER_GID manually." >&2
  exit 1
fi
export DOCKER_UID DOCKER_GID
COMPOSE_DIR="$(dirname "$COMPOSE_FILE")"
DOCKER_UID_ENV="$COMPOSE_DIR/.env.docker-uid"
printf "DOCKER_UID=%s\nDOCKER_GID=%s\n" "$DOCKER_UID" "$DOCKER_GID" > "$DOCKER_UID_ENV"
# Create workspace and agents dir ahead of boot so profile sync does not need first-run mkdir in-container.
mkdir -p .runtime/openclaw-workspace/agents .runtime/openclaw-data
if ! chown -R "${DOCKER_UID}:${DOCKER_GID}" .runtime/openclaw-workspace 2>/dev/null; then
  echo "Note: chown without sudo failed, trying with sudo..." >&2
  if ! sudo chown -R "${DOCKER_UID}:${DOCKER_GID}" .runtime/openclaw-workspace; then
    echo "Error: workspace must be writable by runtime. From repo root run:" >&2
    echo "  sudo chown -R ${DOCKER_UID}:${DOCKER_GID} .runtime/openclaw-workspace" >&2
    exit 1
  fi
fi
if ! chmod -R a+rwX .runtime/openclaw-workspace 2>/dev/null; then
  sudo chmod -R a+rwX .runtime/openclaw-workspace 2>/dev/null || true
fi
WRITE_TEST=".runtime/openclaw-workspace/.write-test-$$"
if ! touch "$WRITE_TEST" 2>/dev/null || ! rm -f "$WRITE_TEST" 2>/dev/null; then
  echo "Error: workspace is not writable by current user (UID $DOCKER_UID). Run:" >&2
  echo "  sudo chown -R ${DOCKER_UID}:${DOCKER_GID} .runtime/openclaw-workspace" >&2
  exit 1
fi
echo "Runtime will run as UID $DOCKER_UID (workspace chown'd). Starting compose..."

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
  docker compose --env-file "$DOCKER_UID_ENV" "${compose_args[@]}" "${up_args[@]}"
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
