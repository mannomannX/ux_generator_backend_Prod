# ==========================================
# ROOT: scripts/setup-dev.sh
# ==========================================
#!/bin/bash

echo "🚀 UX-Flow-Engine Development Setup"
echo "===================================="

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2)
if [[ -z "$NODE_VERSION" ]] || [[ $(echo "$NODE_VERSION" | cut -d'.' -f1) -lt 18 ]]; then
    echo "❌ Node.js 18+ required. Please install Node.js 18 or later."
    exit 1
fi
echo "✅ Node.js $NODE_VERSION detected"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install npm."
    exit 1
fi
echo "✅ npm available"

# Check if MongoDB is running
if ! nc -z localhost 27017 2>/dev/null; then
    echo "⚠️  MongoDB not detected on localhost:27017"
    echo "   Please start MongoDB or update MONGODB_URI in .env"
else
    echo "✅ MongoDB detected on localhost:27017"
fi

# Check if Redis is running
if ! nc -z localhost 6379 2>/dev/null; then
    echo "⚠️  Redis not detected on localhost:6379"
    echo "   Please start Redis or update REDIS_URL in .env"
else
    echo "✅ Redis detected on localhost:6379"
fi

# Setup environment variables
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your Google API key!"
else
    echo "✅ .env file exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Build shared library
echo "🔧 Building shared library..."
npm run build:common

if [ $? -ne 0 ]; then
    echo "❌ Failed to build shared library"
    exit 1
fi

# Create logs directory
mkdir -p logs
echo "✅ Logs directory created"

# Run health check
echo "🔍 Running health check..."
npm run health:check

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file and add your Google API key"
echo "2. Start MongoDB and Redis if not already running"
echo "3. Run 'npm run dev' to start all services"
echo ""
echo "Available commands:"
echo "  npm run dev          - Start all services in development mode"
echo "  npm run test         - Run all tests"
echo "  npm run health:check - Check system health"
echo "  npm run logs:tail    - View aggregated logs"