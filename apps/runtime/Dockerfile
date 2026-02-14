# OpenClaw Mission Control runtime service — multi-stage build.
# Stage 1: install deps, build shared + backend artifacts, compile runtime.

FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY apps/runtime/package.json ./apps/runtime/
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# npm install (not ci): lockfile describes the full monorepo; we only copy
# runtime/shared/backend, so ci would fail on missing optional deps (esbuild, turbo).
RUN npm install

COPY apps/runtime ./apps/runtime
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

RUN cd /app/packages/shared && npm run build
RUN cd /app/packages/backend && npm run seed-skills:generate

WORKDIR /app/apps/runtime
RUN npm run build

# Stage 2: minimal runtime image, production deps only, non-root user.
FROM node:24-alpine

WORKDIR /app

# curl for healthcheck; ca-certificates so Node TLS (e.g. Convex) works reliably.
RUN apk add --no-cache ca-certificates curl

COPY package.json package-lock.json ./
COPY apps/runtime/package.json ./apps/runtime/
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

COPY --from=builder /app/apps/runtime/dist ./apps/runtime/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/convex ./packages/backend/convex

RUN npm install --omit=dev --ignore-scripts

# Non-root user (UID/GID 10001 to avoid clash with base image default 1000).
RUN addgroup --gid 10001 runtime && \
    adduser --uid 10001 --ingroup runtime --disabled-password --gecos "" runtime && \
    chown -R runtime:runtime /app

USER runtime
WORKDIR /app/apps/runtime

# Port matches config (HEALTH_PORT, default 3000) so healthcheck works in any environment.
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD sh -c 'curl -f "http://127.0.0.1:${HEALTH_PORT:-3000}/health" || exit 1'

CMD ["node", "dist/index.js"]
