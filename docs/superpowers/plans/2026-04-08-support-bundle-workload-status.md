# Support Bundle Workload Status Analyzers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `deploymentStatus` and `statefulsetStatus` analyzers for every major workload so the support bundle surfaces component failures with actionable messages.

**Architecture:** Single Helm template modification — append 5 analyzer entries (2 `deploymentStatus`, 3 `statefulsetStatus`) to the existing `analyzers` block in `deploy/charts/templates/support-bundle.yaml`. No new files.

**Tech Stack:** Replicated Troubleshoot (`troubleshoot.sh/v1beta2`), Helm

---

### Task 1: Add workload status analyzers to support bundle spec

**Files:**
- Modify: `deploy/charts/templates/support-bundle.yaml:55-66`

- [ ] **Step 1: Verify current analyzers block contains only the textAnalyze entry**

Run:
```bash
helm template release deploy/charts --set nextauth.secret=test | grep -A6 "analyzers:" | head -20
```
Expected — only the `textAnalyze` block, no `deploymentStatus` or `statefulsetStatus`:
```
      analyzers:
        - textAnalyze:
            checkName: App Health
            fileName: http/app-healthz/response.json
            regex: '"status":"ok"'
            outcomes:
```

- [ ] **Step 2: Append the 5 workload status analyzers after the existing textAnalyze entry**

In `deploy/charts/templates/support-bundle.yaml`, replace the closing of the `analyzers` block so the full analyzers section reads:

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
        - deploymentStatus:
            name: {{ include "playball-exe.fullname" . }}
            namespace: {{ .Release.Namespace }}
            outcomes:
              - fail:
                  when: "< 1"
                  message: "App deployment ({{ include "playball-exe.fullname" . }}) has no available replicas. Users cannot access the application."
              - pass:
                  when: ">= 1"
                  message: App deployment is running.
        - deploymentStatus:
            name: {{ .Values.replicated.nameOverride | default "replicated" }}
            namespace: {{ .Release.Namespace }}
            outcomes:
              - fail:
                  when: "< 1"
                  message: "Replicated SDK deployment ({{ .Values.replicated.nameOverride | default "replicated" }}) has no available replicas. License validation and update checks are unavailable."
              - pass:
                  when: ">= 1"
                  message: Replicated SDK deployment is running.
        - statefulsetStatus:
            name: {{ .Release.Name }}-postgresql
            namespace: {{ .Release.Namespace }}
            outcomes:
              - fail:
                  when: "< 1"
                  message: "PostgreSQL ({{ .Release.Name }}-postgresql) has no ready pods. The application cannot read or write data."
              - pass:
                  when: ">= 1"
                  message: PostgreSQL is running.
        - statefulsetStatus:
            name: {{ .Release.Name }}-redis-master
            namespace: {{ .Release.Namespace }}
            outcomes:
              - fail:
                  when: "< 1"
                  message: "Redis master ({{ .Release.Name }}-redis-master) has no ready pods. Session management and write caching are unavailable."
              - pass:
                  when: ">= 1"
                  message: Redis master is running.
        - statefulsetStatus:
            name: {{ .Release.Name }}-redis-replicas
            namespace: {{ .Release.Namespace }}
            outcomes:
              - fail:
                  when: "< 1"
                  message: "Redis replicas ({{ .Release.Name }}-redis-replicas) have no ready pods. Read throughput may be degraded."
              - pass:
                  when: ">= 1"
                  message: Redis replicas are running.
```

- [ ] **Step 3: Verify all 5 new analyzer types render correctly**

Run:
```bash
helm template release deploy/charts --set nextauth.secret=test | grep -E "deploymentStatus|statefulsetStatus"
```
Expected (exactly 2 `deploymentStatus` and 3 `statefulsetStatus`):
```
        - deploymentStatus:
        - deploymentStatus:
        - statefulsetStatus:
        - statefulsetStatus:
        - statefulsetStatus:
```

- [ ] **Step 4: Verify the rendered names and namespaces are correct**

Run:
```bash
helm template release deploy/charts --set nextauth.secret=test | grep -A3 "deploymentStatus\|statefulsetStatus" | grep "name:\|namespace:"
```
Expected:
```
            name: release
            namespace: default
            name: playball-exe-sdk
            namespace: default
            name: release-postgresql
            namespace: default
            name: release-redis-master
            namespace: default
            name: release-redis-replicas
            namespace: default
```

- [ ] **Step 5: Lint the chart**

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

- [ ] **Step 6: Run npm test**

Run:
```bash
npm test
```
Expected: all tests pass (50 passed).

- [ ] **Step 7: Commit**

```bash
git add deploy/charts/templates/support-bundle.yaml docs/superpowers/plans/2026-04-08-support-bundle-workload-status.md
git commit -m "feat: add deploymentStatus and statefulsetStatus analyzers to support bundle spec"
```

---

### Task 2: Demo — induce failure, collect bundle, verify analyzer output

This task requires a live k3d cluster with the chart deployed. It is a manual verification step, not a code change.

**Prerequisites:** A running cluster with the chart installed. See `scripts/dev-run.sh` or the k3d dev environment docs.

- [ ] **Step 1: Confirm the release name and namespace**

Run:
```bash
helm list -A
```
Note the `NAME` and `NAMESPACE` columns for the playball-exe release. Use these as `<release>` and `<namespace>` in the steps below.

- [ ] **Step 2: Scale the app deployment to zero replicas**

Run (substitute your release name and namespace):
```bash
kubectl scale deployment <release> --replicas=0 -n <namespace>
```
Expected:
```
deployment.apps/<release> scaled
```

- [ ] **Step 3: Confirm the deployment has no available replicas**

Run:
```bash
kubectl get deployment <release> -n <namespace>
```
Expected — `READY` shows `0/1` or `0/0`:
```
NAME       READY   UP-TO-DATE   AVAILABLE   AGE
<release>  0/1     0            0           Xm
```

- [ ] **Step 4: Collect a support bundle**

Run:
```bash
support-bundle --load-cluster-specs --namespace <namespace> --output /tmp/failure-bundle.tar.gz
```
Expected: the CLI runs collectors, then runs analyzers and prints results. Look for a `FAIL` result from `App deployment`.

The analyzer output should include a line like:
```
FAIL   App deployment (<release>) has no available replicas. Users cannot access the application.
```

- [ ] **Step 5: Restore the app deployment**

Run:
```bash
kubectl scale deployment <release> --replicas=1 -n <namespace>
```
Expected:
```
deployment.apps/<release> scaled
```

- [ ] **Step 6: Confirm recovery**

Run:
```bash
kubectl rollout status deployment/<release> -n <namespace>
```
Expected:
```
deployment "<release>" successfully rolled out
```
