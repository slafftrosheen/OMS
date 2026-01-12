#!/bin/bash
# Reclame OMS Startup Script
# This script starts the PostgreSQL container and the Vite dev server

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/home/oms/reclame_OMS"
LOG_FILE="/tmp/reclame-oms.log"

echo "Starting Reclame OMS..."

# Start PostgreSQL container if not running
if ! docker ps | grep -q reclame_postgres; then
    echo "Starting PostgreSQL container..."
    docker start reclame_postgres
    sleep 3
fi

# Check if PostgreSQL is accepting connections
echo "Waiting for PostgreSQL to be ready..."
for i in {1..10}; do
    if docker exec reclame_postgres pg_isready -U reclame_admin -d reclame_oms > /dev/null 2>&1; then
        echo "PostgreSQL is ready"
        break
    fi
    echo "Waiting for PostgreSQL... ($i/10)"
    sleep 2
done

# Kill any existing vite processes
for pid in $(ps aux | grep "vite dev" | grep -v grep | awk '{print $2}'); do
    kill $pid 2>/dev/null || true
done
sleep 2

# Start the Vite dev server
echo "Starting Vite dev server..."
cd "$APP_DIR"
nohup npm run dev -- --host 0.0.0.0 --port 5173 > "$LOG_FILE" 2>&1 &

# Wait for server to start
for i in {1..15}; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200"; then
        echo "✓ Server is running at http://localhost:5173"
        echo "✓ Also accessible at http://$(hostname -I | awk '{print $1}'):5173"
        exit 0
    fi
    echo "Waiting for server to start... ($i/15)"
    sleep 2
done

echo "Warning: Server may not have started properly. Check $LOG_FILE for details."
exit 1
