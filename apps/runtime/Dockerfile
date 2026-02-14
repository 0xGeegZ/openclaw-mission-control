# Stage 1: Dependencies and Build
FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace package files first (for layer caching)
COPY package.json package-lock.json ./
COPY apps/runtime/package.json ./apps/runtime/
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN npm ci

# Copy source code
COPY apps/runtime ./apps/runtime
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Build shared package so runtime can import compiled JS
RUN cd /app/packages/shared && npm run build

# Generate backend seed_skills_content.generated.ts so backend/convex/seed.ts type-checks
RUN cd /app/packages/backend && npm run seed-skills:generate

# Build runtime
WORKDIR /app/apps/runtime
RUN npm run build

# Stage 2: Runtime (minimal image)
FROM node:24-alpine

WORKDIR /app

# FIX 1.6: Alpine 3.18+ includes ca-certificates by default; no need to install
# (previous ca-certificates installation removed)

# Copy package files from builder
COPY package.json package-lock.json ./
COPY apps/runtime/package.json ./apps/runtime/

# Install production dependencies only (no dev dependencies)
RUN npm ci --omit=dev

# Copy built runtime from builder
COPY --from=builder /app/apps/runtime/dist ./apps/runtime/dist

# FIX 1.1: Create non-root user (Security - prevent running as root)
RUN addgroup --gid 1000 runtime && \
    adduser --uid 1000 --ingroup runtime --disabled-password --gecos "" runtime && \
    chown -R runtime:runtime /app

USER runtime

# FIX 1.4: Use exec form for healthcheck (more reliable signal handling)
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:3000/health', (r) => { r.on('data', () => {}); r.on('end', () => process.exit(r.statusCode === 200 ? 0 : 1)); }).on('error', () => process.exit(1));"]

# Run
CMD ["node", "dist/index.js"]
