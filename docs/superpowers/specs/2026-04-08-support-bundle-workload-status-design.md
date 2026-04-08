# Support Bundle Workload Status Analyzers Design

**Date:** 2026-04-08  
**Status:** Approved

## Overview

Extend the support bundle spec with `deploymentStatus` and `statefulsetStatus` analyzers for every major workload in the release. Each analyzer produces a pass/fail result with a failure message that names the component and describes the operational impact. A demo procedure induces a failure and shows the analyzer surfacing it with an actionable message.

## Workload Inventory

Only `Deployment` and `StatefulSet` resource types are present — no Jobs or ReplicaSets.

| Analyzer type | Helm name expression | Component |
|---|---|---|
| `deploymentStatus` | `{{ include "playball-exe.fullname" . }}` | Main app |
| `deploymentStatus` | `{{ .Values.replicated.nameOverride \| default "replicated" }}` | Replicated SDK |
| `statefulsetStatus` | `{{ .Release.Name }}-postgresql` | PostgreSQL |
| `statefulsetStatus` | `{{ .Release.Name }}-redis-master` | Redis master |
| `statefulsetStatus` | `{{ .Release.Name }}-redis-replicas` | Redis replicas |

## Analyzers

Five entries appended to the existing `analyzers` block in `deploy/charts/templates/support-bundle.yaml`. Each uses `when: "< 1"` for fail and `when: ">= 1"` for pass, comparing against available/ready replica count.

### App deployment

```yaml
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
```

### Replicated SDK deployment

```yaml
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
```

### PostgreSQL StatefulSet

```yaml
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
```

### Redis master StatefulSet

```yaml
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
```

### Redis replicas StatefulSet

```yaml
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

## Demo Procedure

Induce a failure by scaling the app deployment to zero replicas, collect the support bundle, observe the failing analyzer, then restore.

```bash
# Induce failure
kubectl scale deployment <release-name> --replicas=0 -n <namespace>

# Collect bundle (spec is auto-discovered via label in cluster)
support-bundle --load-cluster-specs --namespace <namespace>

# Expected: analyzer "App deployment … has no available replicas" surfaces as FAIL

# Restore
kubectl scale deployment <release-name> --replicas=1 -n <namespace>
```
