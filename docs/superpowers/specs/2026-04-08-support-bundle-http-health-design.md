# Support Bundle HTTP Health Collector & Analyzer Design

**Date:** 2026-04-08  
**Status:** Approved

## Overview

Extend the existing support bundle spec with an `http` collector that hits the app's `/api/healthz` endpoint via the in-cluster service DNS name, and a `textAnalyze` analyzer that produces a pass/fail result based on whether the response body contains `"status":"ok"`.

## HTTP Collector

Added to `deploy/charts/templates/support-bundle.yaml` alongside the existing `logs` collectors:

```yaml
- http:
    name: app-healthz
    get:
      url: http://{{ include "playball-exe.fullname" . }}.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.service.port }}/api/healthz
```

The collector stores the response body at `http/app-healthz/response.json` inside the bundle archive.

The URL uses the full in-cluster FQDN (`<service>.<namespace>.svc.cluster.local`) so collection works regardless of which namespace the support-bundle CLI runs in.

## textAnalyze Analyzer

A new `analyzers` section is added to the spec with a single `textAnalyze` entry:

```yaml
analyzers:
  - textAnalyze:
      checkName: App Health
      fileName: http/app-healthz/response.json
      regex: '"status":"ok"'
      outcomes:
        - pass:
            when: "true"
            message: Application is healthy
        - fail:
            when: "false"
            message: Application is not healthy
```

**Pass:** regex `"status":"ok"` matches — the app returned a healthy response.  
**Fail:** regex does not match — covers degraded (`"status":"degraded"`), empty body, network error, or any other non-ok state.

## Health Endpoint Reference

`GET /api/healthz` (defined in `src/app/api/healthz/route.ts`):

- HTTP 200 + `{"status":"ok",...}` — app and DB are healthy
- HTTP 503 + `{"status":"degraded",...}` — DB connectivity failure
