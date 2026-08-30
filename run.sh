#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}MedReach — starting all services${NC}"
echo ""
echo -e "  Backend      → ${YELLOW}http://localhost:4000${NC}"
echo -e "  Bootstrap    → ${YELLOW}http://localhost:3000${NC}"
echo -e "  Tailwind     → ${YELLOW}http://localhost:3001${NC}"
echo -e "  Skeleton CSS → ${YELLOW}http://localhost:3002${NC}"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Cleanup: kill all background jobs on exit
cleanup() {
  echo ""
  echo "Stopping all services..."
  kill 0
}
trap cleanup EXIT INT TERM

# Start backend
cd "$ROOT/backend"
npm run dev &

# Start frontend variants
cd "$ROOT/variants/bootstrap"
npm run dev &

cd "$ROOT/variants/tailwind"
npm run dev &

cd "$ROOT/variants/skeleton"
npm run dev &

# Wait for all background jobs
wait
