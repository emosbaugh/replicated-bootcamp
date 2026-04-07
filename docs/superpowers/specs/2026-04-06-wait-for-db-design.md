# Design: DB Readiness Check on Pod Startup

**Date:** 2026-04-06
**Status:** Approved

## Problem

The `migrate` init container runs `prisma migrate deploy` immediately on pod start. If the PostgreSQL pod is not yet ready (common on first deploy or after cluster restarts), Prisma fails to connect and the init container exits non-zero. Kubernetes retries with exponential backoff, causing a CrashLoopBackOff.

## Solution

Add a `wait-for-db` init container as the first init container in the pod spec. It polls the database TCP port in a loop until the socket connects, then exits 0. The subsequent `migrate` init container only runs once the DB is confirmed reachable.

## Init Container Order

```
wait-for-db → migrate → seed → (app container)
```

## Implementation

Insert a new init container in `deploy/charts/templates/deployment.yaml` before the existing `migrate` container:

```yaml
- name: wait-for-db
  image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
  imagePullPolicy: {{ .Values.image.pullPolicy }}
  command:
    - node
    - -e
    - |
      const net = require('net');
      const u = new URL(process.env.DATABASE_URL);
      const host = u.hostname, port = parseInt(u.port || '5432');
      (function check() {
        const s = net.createConnection(port, host);
        s.on('connect', () => { console.log('DB ready'); s.end(); });
        s.on('error', () => { console.log('Waiting for DB...'); setTimeout(check, 2000); });
      })();
  envFrom:
    - secretRef:
        name: {{ include "playball-exe.fullname" . }}
```

## Key Design Decisions

- **Reuses app image** — no additional image to pull; already cached on the node after the app container pulls it
- **Reads `DATABASE_URL` from the existing secret** — works for both bundled PostgreSQL (`postgresql.enabled=true`) and external databases (`externalDatabase.url`)
- **TCP-level check only** — does not attempt authentication or query execution; just verifies the port is accepting connections, which is sufficient to unblock `prisma migrate deploy`
- **Polls every 2 seconds indefinitely** — Kubernetes will time out the pod via `activeDeadlineSeconds` if needed; no artificial retry cap is added

## Files Changed

- `deploy/charts/templates/deployment.yaml` — insert `wait-for-db` init container before `migrate`
