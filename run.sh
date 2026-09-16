#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}MedReach — starting Bootstrap product${NC}"
echo ""
echo -e "  Backend      → ${YELLOW}http://localhost:4000${NC}"
echo -e "  Bootstrap    → ${YELLOW}http://localhost:3000${NC}"
echo ""
echo "MongoDB must be running. Press Ctrl+C to stop the API and Bootstrap."
echo ""

# Clean up only processes started by this script.
cleanup() {
  echo ""
  echo "Stopping MedReach..."
  kill "$backend_pid" "$bootstrap_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start backend
cd "$ROOT/backend"
export CRAWLER_SCHEDULER_ENABLED="${CRAWLER_SCHEDULER_ENABLED:-true}"
npm run dev &
backend_pid=$!

# Start the active Bootstrap frontend
cd "$ROOT/variants/bootstrap"
npm run dev &
bootstrap_pid=$!

# Wait for all background jobs
wait
