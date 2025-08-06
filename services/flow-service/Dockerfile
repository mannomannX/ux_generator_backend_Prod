# Stage 1: Build common package
FROM node:18-alpine AS common-builder
WORKDIR /common
COPY packages/common/package*.json ./
RUN npm ci --only=production
COPY packages/common/ ./
RUN npm run build

# Stage 2: Build service
FROM node:18-alpine
WORKDIR /app

# Install dumb-init
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy common package
COPY --from=common-builder /common /common

# Copy package files
COPY services/flow-service/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY services/flow-service/ ./

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]