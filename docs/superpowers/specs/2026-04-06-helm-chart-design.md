# playball.exe — Helm Chart Design Spec

**Date:** 2026-04-06
**Status:** Approved

---

## Overview

Add a Helm chart and Dockerfile to deploy the playball.exe Next.js app on self-hosted/local Kubernetes. The chart bundles an optional PostgreSQL database (via Bitnami subchart) and runs Prisma migrations automatically on startup.

---

## File Structure

```
deploy/
  Dockerfile                        # Multi-stage Next.js build
  charts/
    Chart.yaml                      # Chart metadata + postgresql dependency
    values.yaml                     # Default configuration
    templates/
      _helpers.tpl                  # Named template helpers
      deployment.yaml               # Next.js app + migration init container
      service.yaml                  # App service
      ingress.yaml                  # Optional ingress
      secret.yaml                   # App secrets (DATABASE_URL, NEXTAUTH_SECRET)
```

---

## Dockerfile

Multi-stage build using `node:20-alpine`:

1. **deps stage** — `npm ci` to install dependencies
2. **builder stage** — runs `next build` with `output: 'standalone'` enabled in `next.config.ts`
3. **runner stage** — copies `.next/standalone` and `.next/static` only; runs as non-root user

The standalone output requires `output: 'standalone'` in `next.config.ts`. The Prisma generated client (`src/generated/prisma`) must be included in the standalone output — achieved via `outputFileTracingIncludes` in next config.

---

## Chart Dependency: PostgreSQL

Uses the Bitnami PostgreSQL chart via OCI:

```yaml
dependencies:
  - name: postgresql
    version: "16.x.x"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: postgresql.enabled
```

When `postgresql.enabled: true`, the Bitnami chart deploys a PostgreSQL StatefulSet with a PVC. When disabled, users supply `externalDatabase.url`.

`DATABASE_URL` is constructed in `secret.yaml`:
- If `postgresql.enabled`: built from Bitnami's service name and auth values
- If not: taken directly from `externalDatabase.url`

---

## values.yaml Shape

```yaml
image:
  repository: baseball-game        # users override with their registry/image
  tag: latest
  pullPolicy: IfNotPresent

replicaCount: 1

service:
  type: ClusterIP                  # ClusterIP | LoadBalancer | NodePort
  port: 3000

ingress:
  enabled: false
  className: ""
  hostname: ""
  tls: []

postgresql:
  enabled: true
  auth:
    database: baseball
    username: baseball
    password: baseball             # override in production
  primary:
    persistence:
      size: 1Gi

externalDatabase:
  url: ""                          # used when postgresql.enabled=false

nextauth:
  secret: ""
  url: "http://localhost:3000"
```

---

## Migrations

An init container in the app `Deployment` runs `npx prisma migrate deploy` before the main container starts. It uses the same image and mounts the same `DATABASE_URL` from the secret. The app container only starts once the init container exits successfully.

---

## Service & Ingress

- `service.type` controls exposure: `ClusterIP` (internal only), `NodePort`, or `LoadBalancer`
- `ingress.enabled: true` creates an `Ingress` resource with configurable `className`, `hostname`, and optional TLS
- Both `service` and `ingress` can be used together (ingress routes to the ClusterIP service)

---

## Secrets

A single `Secret` resource contains:
- `DATABASE_URL` — constructed or passed through depending on `postgresql.enabled`
- `NEXTAUTH_SECRET` — from `nextauth.secret`
- `NEXTAUTH_URL` — from `nextauth.url`

All are mounted as environment variables in both the init container and the app container.
