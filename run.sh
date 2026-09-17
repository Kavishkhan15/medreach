#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

TARGET="${1:-all}"
pids=()

# Clean up only processes started by this script.
cleanup() {
  echo ""
  echo "Stopping MedReach services..."
  for pid in "${pids[@]}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

echo -e "${GREEN}MedReach — starting services (${TARGET})${NC}"
echo ""
echo -e "  Backend      → ${YELLOW}http://localhost:4000${NC}"

# Start backend
cd "$ROOT/backend"
export CRAWLER_SCHEDULER_ENABLED="${CRAWLER_SCHEDULER_ENABLED:-true}"
npm run dev &
pids+=($!)

case "$TARGET" in
  all)
    echo -e "  Bootstrap    → ${YELLOW}http://localhost:3000${NC}"
    echo -e "  Tailwind     → ${YELLOW}http://localhost:3001${NC}"
    echo -e "  Skeleton CSS → ${YELLOW}http://localhost:3002${NC}"
    echo ""
    echo "MongoDB must be running. Press Ctrl+C to stop all services."
    echo ""

    cd "$ROOT/variants/bootstrap"
    npm run dev &
    pids+=($!)

    cd "$ROOT/variants/tailwind"
    npm run dev &
    pids+=($!)

    cd "$ROOT/variants/skeleton"
    npm run dev &
    pids+=($!)
    ;;
  bootstrap)
    echo -e "  Bootstrap    → ${YELLOW}http://localhost:3000${NC}"
    echo ""
    echo "MongoDB must be running. Press Ctrl+C to stop the API and Bootstrap."
    echo ""

    cd "$ROOT/variants/bootstrap"
    npm run dev &
    pids+=($!)
    ;;
  tailwind)
    echo -e "  Tailwind     → ${YELLOW}http://localhost:3001${NC}"
    echo ""
    echo "MongoDB must be running. Press Ctrl+C to stop the API and Tailwind."
    echo ""

    cd "$ROOT/variants/tailwind"
    npm run dev &
    pids+=($!)
    ;;
  skeleton)
    echo -e "  Skeleton CSS → ${YELLOW}http://localhost:3002${NC}"
    echo ""
    echo "MongoDB must be running. Press Ctrl+C to stop the API and Skeleton."
    echo ""

    cd "$ROOT/variants/skeleton"
    npm run dev &
    pids+=($!)
    ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Usage: ./run.sh [all|bootstrap|tailwind|skeleton]"
    exit 1
    ;;
esac

# Wait for all background jobs
wait
