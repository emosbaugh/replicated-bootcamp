# Stage 0: download support-bundle binary
FROM alpine:3.19 AS support-bundle-downloader
ARG SUPPORT_BUNDLE_VERSION=v0.125.1
RUN apk add --no-cache wget && \
    wget -qO /tmp/sb.tar.gz \
      "https://github.com/replicatedhq/troubleshoot/releases/download/${SUPPORT_BUNDLE_VERSION}/support-bundle_linux_amd64.tar.gz" && \
    tar -xzf /tmp/sb.tar.gz -C /tmp support-bundle && \
    chmod +x /tmp/support-bundle

# Stage 1: install all dependencies (needed for build and prisma generate)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: install production dependencies only (no ts-node, typescript, vitest, tailwindcss, etc.)
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/
# After install, remove Prisma engine binaries for non-Alpine platforms. The app uses
# @prisma/adapter-pg (driver adapters) so no query engine is needed at all — only the
# schema engine binary for `prisma migrate deploy` on linux-musl is required.
RUN npm ci --omit=dev && \
    find ./node_modules/@prisma/engines -type f \( -name "query-engine-*" -o -name "libquery_engine-*" \) -delete && \
    find ./node_modules/@prisma/engines -type f -name "schema-engine-*" ! -name "*linux-musl*" -delete && \
    find ./node_modules/prisma -type f -name "query-engine-*" -delete

# Stage 3: build the Next.js app and pre-compile the seed script
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# DATABASE_URL and REDIS_URL must be set at build time because Next.js collects
# page data (executes route modules) during the build step. Placeholders are
# sufficient since no real connections are made during build.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    REDIS_URL="redis://localhost:6379" \
    npm run build
# Pre-compile seed.ts to JS so the runner image doesn't need ts-node or typescript
RUN node_modules/.bin/tsc \
    --module commonjs \
    --moduleResolution node \
    --target ES2017 \
    --esModuleInterop \
    --skipLibCheck \
    --noEmit false \
    --rootDir /app \
    --outDir /app/seed-dist \
    prisma/seed.ts
# Write a plain-JS prisma config for the runner (no dotenv needed — DATABASE_URL comes from k8s secret)
RUN printf 'const { defineConfig } = require("prisma/config");\nmodule.exports = defineConfig({ schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations" }, datasource: { url: process.env.DATABASE_URL } });\n' > /app/prisma.config.js

# Stage 4: production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone Next.js server output
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Production-only node_modules (devDependencies excluded)
# @prisma/engines native binaries (~100MB) are a production dep and unavoidable for migrations
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Prisma schema and migrations for the migrate init container
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Generated Prisma client (required by seed.js at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated

# Pre-compiled seed script (replaces seed.ts — no ts-node needed)
COPY --from=builder --chown=nextjs:nodejs /app/seed-dist/prisma/seed.js ./prisma/seed.js

COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.js ./prisma.config.js
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

COPY --from=support-bundle-downloader /tmp/support-bundle /usr/local/bin/support-bundle

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
