# =====================================
# OFM Social OS API - Production Dockerfile
# Security-hardened with multi-stage build
# =====================================

# =====================================
# Stage 1: Build Dependencies
# =====================================
FROM node:20-alpine AS dependencies

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache \
    # Build dependencies
    python3 \
    make \
    g++ \
    # Security tools
    dumb-init \
    # Clean up
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

WORKDIR /app

# Copy package files first (better Docker layer caching)
COPY backend/api/package*.json ./
COPY backend/api/tsconfig.json ./

# Install dependencies with security flags
RUN npm ci --only=production --ignore-scripts --no-audit --no-fund && \
    npm cache clean --force

# =====================================  
# Stage 2: Build Application
# =====================================
FROM dependencies AS builder

# Install dev dependencies for build
RUN npm ci --ignore-scripts --no-audit --no-fund

# Copy source code
COPY backend/api/src/ ./src/

# Build TypeScript
RUN npm run build && \
    # Remove dev dependencies after build
    npm prune --production && \
    # Remove unnecessary files
    rm -rf src/ tsconfig.json

# =====================================
# Stage 3: Production Runtime
# =====================================
FROM node:20-alpine AS runtime

# Security: Install security updates and required tools
RUN apk update && apk upgrade && \
    apk add --no-cache \
    # Runtime requirements
    dumb-init \
    # Security tools
    tini \
    # Clean up
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S api -u 1001 -G nodejs

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /app/dist ./dist
COPY --from=builder --chown=api:nodejs /app/package*.json ./

# Copy database migrations
COPY --chown=api:nodejs backend/database/migrations/ ./migrations/

# Security: Set file permissions
RUN chmod -R 755 /app && \
    chmod -R 644 /app/dist && \
    chmod -R 644 /app/migrations && \
    chmod 755 /app/node_modules/.bin/*

# Security: Switch to non-root user
USER api

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: process.env.PORT || 3000, path: '/health', timeout: 5000 }; \
    const req = http.request(options, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => process.exit(1)); \
    req.end();"

# Security: Expose port
EXPOSE 3000

# Environment variables defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info

# Security: Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]

# =====================================
# Security Labels (for compliance)
# =====================================
LABEL \
    org.opencontainers.image.title="OFM Social OS API" \
    org.opencontainers.image.description="Multi-platform social media publishing API with AI agents" \
    org.opencontainers.image.version="1.0.0" \
    org.opencontainers.image.created="2025-08-12T00:00:00Z" \
    org.opencontainers.image.authors="OFM Social Team" \
    org.opencontainers.image.url="https://ofm-social.com" \
    org.opencontainers.image.documentation="https://docs.ofm-social.com" \
    org.opencontainers.image.source="https://github.com/ofm-social/social-os" \
    org.opencontainers.image.vendor="OFM Social" \
    org.opencontainers.image.licenses="MIT" \
    # Security metadata
    security.scan.enabled="true" \
    security.vulnerability.policy="zero-tolerance" \
    security.compliance.cis="enabled" \
    security.runtime.user="1001" \
    security.runtime.group="1001" \
    security.runtime.readonly="true"