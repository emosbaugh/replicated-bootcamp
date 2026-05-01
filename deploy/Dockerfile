# Stage 0: download support-bundle binary
FROM alpine:3.23 AS support-bundle-downloader
ARG SUPPORT_BUNDLE_VERSION=v0.128.1
RUN apk add --no-cache wget && \
    wget -qO /tmp/sb.tar.gz \
      "https://github.com/replicatedhq/troubleshoot/releases/download/${SUPPORT_BUNDLE_VERSION}/support-bundle_linux_amd64.tar.gz" && \
    tar -xzf /tmp/sb.tar.gz -C /tmp support-bundle && \
    chmod +x /tmp/support-bundle

# Stage 1: install all dependencies (needed for build and prisma generate)
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: install minimal dependencies for init containers (prisma migrate, seed).
# The app and the init containers have completely separate node_modules.
FROM node:24-alpine AS prisma-init
WORKDIR /app/prisma-init
COPY ./prisma-init/package.json ./prisma-init/package-lock.json ./
# Only download the Prisma engine binary for the Alpine (linux-musl) platform.
# Without this, Prisma ships binaries for every OS (~20MB each).
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
RUN npm install --omit=dev && \
    \
    # typescript is an optional peerDependency of the prisma CLI; not needed at runtime.
    rm -rf node_modules/typescript && \
    \
    # The prisma package bundles query compiler WASM files (~25MB) that are not needed
    # for `prisma migrate deploy`; only the schema engine binary is required.
    find node_modules/prisma/build -type f -name "query_compiler_*" -delete && \
    \
    # @prisma/studio-core ships a full React UI (~37MB). The CLI only needs data/bff.
    rm -rf node_modules/@prisma/studio-core/dist/ui && \
    find node_modules/@prisma/studio-core/dist -name "metafile-*.json" -delete && \
    rm -rf node_modules/@prisma/studio-core/dist/data/sqlite-core && \
    rm -rf node_modules/@prisma/studio-core/dist/data/postgres-core && \
    rm -rf node_modules/@prisma/studio-core/dist/data/pglite && \
    rm -rf node_modules/@prisma/studio-core/dist/data/mysql-core && \
    find node_modules/@prisma/studio-core/dist -name "chunk-*.js" -delete && \
    find node_modules/@prisma/studio-core/dist -name "index.css" -delete

# Stage 3: build the Next.js app and pre-compile the seed script
FROM node:24-alpine AS builder
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
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable auto-updates for the support-bundle troubleshoot binary
ENV TROUBLESHOOT_AUTO_UPDATE=false

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone app — runs from its own directory with its own traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./standalone/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./standalone/public

# Init-container workspace — completely isolated from the app. Contains only the
# Prisma CLI, the schema/migrations, the generated client, and the compiled seed.
COPY --from=prisma-init --chown=nextjs:nodejs /app/prisma-init ./prisma-init
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma-init/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.js ./prisma-init/prisma.config.js
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./prisma-init/src/generated
COPY --from=builder --chown=nextjs:nodejs /app/seed-dist/prisma/seed.js ./prisma-init/prisma/seed.js

COPY --from=support-bundle-downloader /tmp/support-bundle /usr/local/bin/support-bundle

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run from the standalone directory so Node.js resolves modules from
# /app/standalone/node_modules/ (the minimal traced set).
CMD ["node", "standalone/server.js"]
