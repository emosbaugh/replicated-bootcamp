# Support Bundle HTTP Health Collector & Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an HTTP collector and textAnalyze analyzer to the support bundle spec so bundle collection hits `/api/healthz` and produces a pass/fail health check result.

**Architecture:** Single Helm template modification — append an `http` collector and an `analyzers` block to the existing `SupportBundle` spec embedded in `deploy/charts/templates/support-bundle.yaml`.

**Tech Stack:** Replicated Troubleshoot (`troubleshoot.sh/v1beta2`), Helm

---

### Task 1: Add HTTP collector and textAnalyze analyzer to support bundle spec

**Files:**
- Modify: `deploy/charts/templates/support-bundle.yaml`

- [ ] **Step 1: Verify the current rendered spec has no analyzers section**

Run:
```bash
helm template . deploy/charts --set nextauth.secret=test | grep -A5 analyzers
```
Expected: no output (no `analyzers` key exists yet).

- [ ] **Step 2: Add the http collector and analyzers block**

In `deploy/charts/templates/support-bundle.yaml`, replace the closing of the `collectors` list (after the last `logs` block) so the full spec reads:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "playball-exe.fullname" . }}-support-bundle
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
    troubleshoot.sh/kind: support-bundle
stringData:
  support-bundle-spec: |
    apiVersion: troubleshoot.sh/v1beta2
    kind: SupportBundle
    metadata:
      name: {{ include "playball-exe.fullname" . }}
    spec:
      collectors:
        - logs:
            name: app
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=playball-exe
            limits:
              maxAge: "720h"
              maxLines: 10000
        - logs:
            name: postgres
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=postgresql
              - app.kubernetes.io/instance={{ .Release.Name }}
            limits:
              maxAge: "720h"
              maxLines: 10000
        - logs:
            name: redis
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=redis
              - app.kubernetes.io/instance={{ .Release.Name }}
            limits:
              maxAge: "720h"
              maxLines: 10000
        - logs:
            name: sdk
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name={{ .Values.replicated.nameOverride | default "replicated" }}
              - app.kubernetes.io/instance={{ .Release.Name }}
            limits:
              maxAge: "720h"
              maxLines: 10000
        - http:
            name: app-healthz
            get:
              url: http://{{ include "playball-exe.fullname" . }}.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.service.port }}/api/healthz
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

- [ ] **Step 3: Render the template and verify the http collector and analyzer appear**

Run:
```bash
helm template . deploy/charts --set nextauth.secret=test | grep -A6 "app-healthz"
```
Expected output (namespace will render as `default` with no `--namespace` flag):
```
        - http:
            name: app-healthz
            get:
              url: http://release-name-playball-exe.default.svc.cluster.local:3000/api/healthz
```

Run:
```bash
helm template . deploy/charts --set nextauth.secret=test | grep -A8 "textAnalyze"
```
Expected output:
```
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

- [ ] **Step 4: Lint the chart**

Run:
```bash
helm lint deploy/charts --set nextauth.secret=test
```
Expected:
```
==> Linting deploy/charts
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

- [ ] **Step 5: Run npm test**

Run:
```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add deploy/charts/templates/support-bundle.yaml docs/superpowers/specs/2026-04-08-support-bundle-http-health-design.md docs/superpowers/plans/2026-04-08-support-bundle-http-health.md
git commit -m "feat: add http health collector and textAnalyze analyzer to support bundle spec"
```
