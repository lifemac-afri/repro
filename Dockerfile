# Multi-stage Dockerfile for RePro (Optimized for Coolify and Docker)

# Stage 1: Build the React frontend
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./
COPY server/package.json ./server/

# Install all dependencies (including devDependencies for Vite)
RUN npm install

# Copy source code and build frontend
COPY . .
RUN npm run build

# Stage 2: Production runner
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install native dependencies required for better-sqlite3 compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests
COPY package.json package-lock.json* ./
COPY server/package.json ./server/

# Install production dependencies
RUN npm install --omit=dev

# Copy backend server code
COPY server/ ./server/

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Create persistent storage directory for SQLite database & uploaded receipts
RUN mkdir -p /app/server/data/receipts

# Expose Coolify application port
EXPOSE 3000

# Volume for data persistence across container restarts
VOLUME ["/app/server/data"]

# Healthcheck for Coolify / Docker
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "server/index.js"]
