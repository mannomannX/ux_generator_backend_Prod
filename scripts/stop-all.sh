#!/bin/bash
# ==========================================
# Stop all UX-Flow-Engine services
# ==========================================

echo "🛑 Stopping UX-Flow-Engine Services..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to stop a service
stop_service() {
    local service_name=$1
    local pid_file="logs/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        PID=$(cat "$pid_file")
        if ps -p $PID > /dev/null; then
            echo "Stopping $service_name (PID: $PID)..."
            kill $PID
            rm "$pid_file"
        else
            echo "$service_name is not running (stale PID file)"
            rm "$pid_file"
        fi
    else
        echo "$service_name is not running (no PID file)"
    fi
}

# Stop all services
stop_service "api-gateway"
stop_service "cognitive-core"
stop_service "knowledge-service"
stop_service "flow-service"
stop_service "user-management"
stop_service "billing-service"

echo -e "${GREEN}✅ All services stopped!${NC}"