#!/usr/bin/env bash
# Trace file descriptor usage in runtime Docker containers (openclaw-gateway, runtime).
# Run from repo root when compose is up. Helps debug ENFILE / file table overflow.
# Usage: ./scripts/runtime-docker-trace-fds.sh [openclaw-gateway|runtime|all]

set -euo pipefail

COMPOSE_FILE="apps/runtime/docker-compose.runtime.yml"
cd "$(dirname "$0")/.."

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: $COMPOSE_FILE not found. Run from repo root." >&2
  exit 1
fi

SERVICE="${1:-all}"

run_in() {
  local name=$1
  shift
  docker compose -f "$COMPOSE_FILE" --profile openclaw exec "$name" sh -c "$*"
}

report_container() {
  local name=$1
  echo "========== $name =========="
  if ! docker compose -f "$COMPOSE_FILE" --profile openclaw ps "$name" --status running -q 2>/dev/null | grep -q .; then
    echo "(not running or profile openclaw not up)"
    return
  fi
  echo "--- System limits ---"
  run_in "$name" "echo file-max: \$(cat /proc/sys/fs/file-max 2>/dev/null || echo N/A); echo ulimit -n: \$(ulimit -n 2>/dev/null || echo N/A)"
  echo "--- FD count by PID (processes with open FDs) ---"
  run_in "$name" "for p in /proc/[0-9]*; do [ -d \"\${p}/fd\" ] && n=\$(ls \"\${p}/fd\" 2>/dev/null | wc -l) && [ \"\$n\" -gt 0 ] && echo \"  \$(basename \$p): \$n fds  (\$(cat \$p/cmdline 2>/dev/null | tr '\\0' ' ' | head -c 80))\"; done"
  echo "--- Total open FDs in container ---"
  run_in "$name" "total=0; for p in /proc/[0-9]*; do [ -d \"\${p}/fd\" ] && total=\$((total + \$(ls \"\${p}/fd\" 2>/dev/null | wc -l))); done; echo \"  total: \$total\""
  echo ""
}

case "$SERVICE" in
  openclaw-gateway) report_container openclaw-gateway ;;
  runtime)            report_container runtime ;;
  all)
    report_container openclaw-gateway
    report_container runtime
    ;;
  *)
    echo "Usage: $0 [openclaw-gateway|runtime|all]" >&2
    exit 1
    ;;
esac
