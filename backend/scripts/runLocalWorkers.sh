#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pids=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM
for role in notification expiry recovery; do
  node "src/workers/$role.js" &
  pids+=("$!")
done
# One failed worker stops the local group; production supervises each role separately.
wait -n "${pids[@]}"
