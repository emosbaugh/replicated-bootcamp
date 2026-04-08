# k3d Local Dev Environment Design

**Date:** 2026-04-07
**Branch:** stuff

## Goal

Replace `docker compose up` with a k3d-based hybrid dev environment: postgres, redis, and the Replicated SDK run in a local k3d cluster; Next.js continues to run locally via `npm run dev`. This gives developers a running SDK instance (for license/updates/metrics APIs) without needing a CMX cluster.

## Architecture

- **k3d cluster** runs: postgres, redis, Replicated SDK subchart
- **Local process** runs: Next.js (`npm run dev`)
- **Port-forwarding** connects the two: postgres → `localhost:5432`, redis → `localhost:6379`, SDK → `localhost:3001`
- **Existing Helm chart** is reused (preventing drift) with a new `values.dev.yaml` override file

The SDK runs in integration mode using a Development license from the Vendor Portal. License endpoints return real license data; app endpoints (updates, etc.) return mock data.

## Chart Changes

### `deploy/charts/values.yaml`

Add at top level:

```yaml
app:
  enabled: true
```

Default `true` preserves all existing behavior.

### `deploy/charts/templates/deployment.yaml`

Wrap entire template:

```yaml
{{- if .Values.app.enabled }}
...existing content...
{{- end }}
```

### `deploy/charts/values.schema.json`

Add to `properties`:

```json
"app": {
  "type": "object",
  "properties": {
    "enabled": {
      "type": "boolean"
    }
  }
}
```

### `deploy/charts/values.dev.yaml` (new file)

```yaml
app:
  enabled: false

nextauth:
  secret: dev
  url: http://localhost:3000
```

Minimal — no registry overrides needed. The existing `images.emosbaugh.be` proxy + `global.replicated.dockerconfigjson` approach (same as CMX testing) handles image auth for postgres, redis, and the SDK.

### `.env.example`

Add:

```
REPLICATED_SDK_URL=http://localhost:3001
```

## New Doc: `docs/testing-locally.md`

Structure mirrors `docs/testing-with-cmx.md`. Sections:

1. **Prerequisites** — k3d, kubectl, helm (no `replicated` CLI needed)
2. **Set Your License ID** — export `REPLICATED_LICENSE_ID`
3. **Create a Cluster** — `k3d cluster create playball-dev`
4. **Install the Helm Chart** — build `dockerconfigjson` (same pattern as CMX doc), then `helm install playball deploy/charts -f deploy/charts/values.dev.yaml` with `nextauth.secret`, `replicated.integration.licenseID`, and `global.replicated.dockerconfigjson`
5. **Port-Forward Services** — three background commands:
   - `kubectl port-forward svc/playball-postgresql 5432:5432 &`
   - `kubectl port-forward svc/playball-redis-master 6379:6379 &`
   - `kubectl port-forward svc/playball-exe-sdk 3001:3000 &` (SDK on 3001, not 3000, to avoid conflict with Next.js)
6. **Configure `.env.local`** — copy `.env.example` (already includes `REPLICATED_SDK_URL=http://localhost:3001` after this change)
7. **Run Migrations** — `npx prisma migrate dev && npx prisma db seed`
8. **Start the Dev Server** — `npm run dev`
9. **AI assistant note** — pass license ID literally rather than relying on `${REPLICATED_LICENSE_ID}` expansion (same note pattern as CMX doc)
10. **Clean Up** — `k3d cluster delete playball-dev`

## Service Names (verified via `helm template`)

| Service | Helm name | Local port |
|---------|-----------|------------|
| PostgreSQL | `playball-postgresql` | 5432 |
| Redis | `playball-redis-master` | 6379 |
| Replicated SDK | `playball-exe-sdk` | 3001 (→ svc:3000) |

## README Update

Replace the "Start the database" step (`docker compose up -d`) with a note pointing to `docs/testing-locally.md` for k3d setup. Keep `docker compose up -d` as a simpler fallback for users who don't need the SDK running locally.
