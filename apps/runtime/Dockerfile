FROM node:24-alpine

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
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Build
WORKDIR /app/apps/runtime
RUN npm run build

# Run
CMD ["node", "dist/index.js"]
