#!/bin/bash
# ==========================================
# Start all UX-Flow-Engine services
# ==========================================

echo "🚀 Starting UX-Flow-Engine Services..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    echo -e "${YELLOW}⚠️  MongoDB is not running. Please start MongoDB first.${NC}"
    echo "Run: mongod --dbpath /path/to/data"
    exit 1
fi

# Check if Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Redis is not running. Please start Redis first.${NC}"
    echo "Run: redis-server"
    exit 1
fi

# Build common package first
echo -e "${GREEN}📦 Building Common Package...${NC}"
cd packages/common
npm install
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to build Common Package${NC}"
    exit 1
fi
cd ../..

# Function to start a service
start_service() {
    local service_name=$1
    local service_path=$2
    local port=$3
    
    echo -e "${GREEN}Starting $service_name on port $port...${NC}"
    cd $service_path
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies for $service_name..."
        npm install
    fi
    
    # Start the service in background
    npm start > ../../logs/${service_name}.log 2>&1 &
    echo $! > ../../logs/${service_name}.pid
    
    cd ../..
    sleep 2
}

# Create logs directory if it doesn't exist
mkdir -p logs

# Start services in order
start_service "api-gateway" "services/api-gateway" 3000
start_service "cognitive-core" "services/cognitive-core" 3001
start_service "knowledge-service" "services/knowledge-service" 3002
start_service "flow-service" "services/flow-service" 3003
start_service "user-management" "services/user-management" 3004
start_service "billing-service" "services/billing-service" 3005

echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo "Services are running on:"
echo "  • API Gateway:       http://localhost:3000"
echo "  • Cognitive Core:    http://localhost:3001"
echo "  • Knowledge Service: http://localhost:3002"
echo "  • Flow Service:      http://localhost:3003"
echo "  • User Management:   http://localhost:3004"
echo "  • Billing Service:   http://localhost:3005"
echo ""
echo "Logs are available in the 'logs' directory"
echo "To stop all services, run: ./scripts/stop-all.sh"