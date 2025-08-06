# Stage 1: Build common package
FROM node:18-alpine AS common-builder
WORKDIR /common

# Copy common package files
COPY packages/common/package*.json ./
RUN npm ci --only=production

COPY packages/common/ ./
RUN npm run build

# Stage 2: Build service
FROM node:18-alpine
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy common package from builder
COPY --from=common-builder /common /common

# Copy package files
COPY services/api-gateway/package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY services/api-gateway/ ./

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]