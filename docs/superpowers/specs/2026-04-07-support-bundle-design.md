# Support Bundle Spec Design

**Date:** 2026-04-07  
**Status:** Approved

## Overview

Add a Replicated support bundle spec to the playball-exe Helm chart, and collect a support bundle as a CI artifact in the e2e workflow.

## Support Bundle Spec — Helm Template

**File:** `deploy/charts/templates/support-bundle.yaml`

A Kubernetes Secret with label `troubleshoot.sh/kind: support-bundle`. The `support-bundle` CLI discovers specs by listing Secrets with this label and reading the embedded spec from the `support-bundle-spec` key.

The embedded spec collects pod logs for all three workloads, each scoped to `.Release.Namespace`:

| Collector | Label selectors |
|-----------|----------------|
| App (playball-exe) | `app.kubernetes.io/name: playball-exe` |
| PostgreSQL | `app.kubernetes.io/name: postgresql` + `app.kubernetes.io/instance: <release>` |
| Redis | `app.kubernetes.io/name: redis` + `app.kubernetes.io/instance: <release>` |

The PostgreSQL and Redis selectors include the instance label to avoid collecting logs from unrelated PostgreSQL/Redis deployments in the same namespace.

## CI Collection — e2e.yml

Three steps added to `.github/workflows/e2e.yml`, all with `if: always()`. They are placed after the test steps and before the cleanup steps (archive customer/channel, delete cluster) so the cluster is still live during collection.

1. **Install support-bundle CLI** — downloads the `support-bundle` binary from the `replicatedhq/troubleshoot` GitHub releases for `linux/amd64`.
2. **Collect support bundle** — runs `support-bundle --load-cluster-specs` with the kubeconfig written by the `create-cluster` step (`export-kubeconfig: "true"`). Output written to `/tmp/support-bundle.tar.gz`.
3. **Upload artifact** — uses `actions/upload-artifact@v4` to attach the bundle, named `support-bundle-${{ github.run_id }}`.
