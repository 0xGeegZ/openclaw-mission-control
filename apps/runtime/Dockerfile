FROM node:24-alpine

# Ensure HTTPS to Convex (and other services) works; Alpine can miss CA certs.
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy workspace files
COPY package.json package-lock.json ./
COPY apps/runtime/package.json ./apps/runtime/
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN npm ci

# Copy source
COPY apps/runtime ./apps/runtime
COPY docs/runtime ./docs/runtime
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Build shared package so runtime can import compiled JS.
RUN cd /app/packages/shared && npm run build

# Generate backend seed_skills_content.generated.ts so backend/convex/seed.ts type-checks when building runtime
RUN cd /app/packages/backend && npm run seed-skills:generate

# Build
WORKDIR /app/apps/runtime
RUN npm run build

# Healthcheck: GET /health must return 200
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', (r) => { r.on('data', () => {}); r.on('end', () => process.exit(r.statusCode === 200 ? 0 : 1)); }).on('error', () => process.exit(1));"

# Run
CMD ["node", "dist/index.js"]
