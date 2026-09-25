#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

TARGET="${1:-all}"
pids=()

# Robust cleanup: terminate processes and their child trees
cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping MedReach services...${NC}"
  for pid in "${pids[@]}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

# Check if a port is in use
check_port() {
  local port="$1"
  local name="$2"
  if command -v lsof >/dev/null 2>&1; then
    if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo -e "${YELLOW}Notice: Port $port ($name) appears to already be in use.${NC}"
    fi
  fi
}

# Check MongoDB connectivity
check_mongo() {
  if ! timeout 1 bash -c 'cat < /dev/null > /dev/tcp/localhost/27017' 2>/dev/null; then
    echo -e "${YELLOW}Notice: MongoDB is not responding on localhost:27017.${NC}"
    echo -e "${YELLOW}Ensure mongod service is started if running with local database.${NC}"
    echo ""
  fi
}

case "$TARGET" in
  help|-h|--help)
    echo "MedReach Multi-Framework Service Launcher"
    echo ""
    echo "Usage: ./run.sh [target]"
    echo ""
    echo "Targets:"
    echo "  all         Start backend (4000) and all 3 variants: Bootstrap (3000), Tailwind (3001), Skeleton (3002) [default]"
    echo "  bootstrap   Start backend (4000) and Bootstrap variant (3000)"
    echo "  tailwind    Start backend (4000) and Tailwind variant (3001)"
    echo "  skeleton    Start backend (4000) and Skeleton CSS variant (3002)"
    echo "  backend|api Start backend API server only (4000)"
    echo "  seed        Run database seeding (Mumbai hospitals, blood banks, diagnostics, ambulances)"
    echo "  help        Show this help message"
    trap - EXIT INT TERM
    exit 0
    ;;
  seed)
    echo -e "${GREEN}Running MedReach database seed...${NC}"
    cd "$ROOT/backend"
    npm run seed:mumbai
    trap - EXIT INT TERM
    exit 0
    ;;
  all|bootstrap|tailwind|skeleton|backend|api)
    ;;
  *)
    echo -e "${RED}Unknown target: $TARGET${NC}"
    echo "Usage: ./run.sh [all|bootstrap|tailwind|skeleton|backend|seed|help]"
    exit 1
    ;;
esac

echo -e "${GREEN}MedReach — starting services (${TARGET})${NC}"
echo ""

# Check database
check_mongo

# Check port for backend
check_port 4000 "Backend API"

echo -e "  Backend      → ${YELLOW}http://localhost:4000${NC}"

# Start backend
cd "$ROOT/backend"
export CRAWLER_SCHEDULER_ENABLED="${CRAWLER_SCHEDULER_ENABLED:-true}"
npm run dev &
pids+=($!)

case "$TARGET" in
  all)
    check_port 3000 "Bootstrap"
    check_port 3001 "Tailwind"
    check_port 3002 "Skeleton"

    echo -e "  Bootstrap    → ${YELLOW}http://localhost:3000${NC}"
    echo -e "  Tailwind     → ${YELLOW}http://localhost:3001${NC}"
    echo -e "  Skeleton CSS → ${YELLOW}http://localhost:3002${NC}"
    echo ""
    echo -e "${CYAN}Press Ctrl+C to stop all services.${NC}"
    echo ""

    (cd "$ROOT/variants/bootstrap" && npm run dev) &
    pids+=($!)

    (cd "$ROOT/variants/tailwind" && npm run dev) &
    pids+=($!)

    (cd "$ROOT/variants/skeleton" && npm run dev) &
    pids+=($!)
    ;;
  bootstrap)
    check_port 3000 "Bootstrap"
    echo -e "  Bootstrap    → ${YELLOW}http://localhost:3000${NC}"
    echo ""
    echo -e "${CYAN}Press Ctrl+C to stop the API and Bootstrap.${NC}"
    echo ""

    (cd "$ROOT/variants/bootstrap" && npm run dev) &
    pids+=($!)
    ;;
  tailwind)
    check_port 3001 "Tailwind"
    echo -e "  Tailwind     → ${YELLOW}http://localhost:3001${NC}"
    echo ""
    echo -e "${CYAN}Press Ctrl+C to stop the API and Tailwind.${NC}"
    echo ""

    (cd "$ROOT/variants/tailwind" && npm run dev) &
    pids+=($!)
    ;;
  skeleton)
    check_port 3002 "Skeleton"
    echo -e "  Skeleton CSS → ${YELLOW}http://localhost:3002${NC}"
    echo ""
    echo -e "${CYAN}Press Ctrl+C to stop the API and Skeleton.${NC}"
    echo ""

    (cd "$ROOT/variants/skeleton" && npm run dev) &
    pids+=($!)
    ;;
  backend|api)
    echo ""
    echo -e "${CYAN}Press Ctrl+C to stop the Backend API.${NC}"
    echo ""
    ;;
esac

# Wait for all background jobs
wait
