# Helm Chart Image Scanning with SARIF Upload

> **Status:** Approved for implementation
> **Date:** 2026-05-01
> **Branch:** feat/helm-image-scanning

## Summary

Add CI/CD capability to extract **all** container images used by the application deployment — from the playball-exe Helm chart, its subchart dependencies (PostgreSQL, Redis, Replicated SDK), and the Embedded Cluster extension charts (cert-manager, traefik) — scan each with Grype, and upload per-image SARIF reports to the GitHub Security tab.

This replaces the previous single-image `image-scan.yml` which only scanned `ghcr.io/replemos/playball.exe`.

## Background

The previous `image-scan.yml` scanned only the application image built from this repo. However, the deployment uses many more images:

- **Main chart dependencies** (`deploy/charts/Chart.yaml`): PostgreSQL, Redis, Replicated SDK
- **EC extension charts** (`deploy/manifests/embedded-cluster-config.yaml`): cert-manager, traefik

These images run in the cluster but were never scanned. This workflow discovers them dynamically from rendered Helm templates and scans them all.

## Goals

1. Extract all unique container images from all Helm charts used in the deployment
2. Scan each extracted image for vulnerabilities using Grype
3. Generate SARIF reports for each image
4. Upload SARIF reports to GitHub Security tab with per-image categories
5. Never fail the build on vulnerabilities (report-only)
6. Run on every PR and on a daily schedule

## Non-Goals

- Fix or patch vulnerabilities in dependency images
- Block PRs based on vulnerability findings
- Scan images at runtime in the cluster
- Generate custom SBOMs (Grype does this internally)

## Architecture

### Image Extraction

The workflow discovers images from three sources:

1. **Main chart** — `helm dependency update && helm template deploy/charts`
2. **EC extensions** — `helm template jetstack/cert-manager` and `helm template traefik/traefik`

For each source:
- Render templates with dependency/enabled flags and upstream registries
- Pipe through `yq '.. | .image? | select(.)' | grep -v '^---$'` to extract all `image:` fields
- Combine, deduplicate with `sort -u`, and output compact JSON array

**Registry overrides** (main chart uses Replicated proxy registries in values):
- `--set image.registry=ghcr.io`
- `--set postgresql.image.registry=docker.io`
- `--set redis.image.registry=docker.io`
- `--set replicated.image.registry=proxy.replicated.com`

Extension charts are templated with default values (upstream registries already).

### Scanning

Matrix job — one parallel Grype scan per unique image. Each uploads SARIF with a unique sanitized category (e.g., `helm-image-quay-io-jetstack-cert-manager-controller-v1.17.2`).

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐
│ deploy/charts   │     │ EC extensions   │
│  + dependencies │     │ (cert-manager,  │
│  (postgresql,   │     │  traefik)       │
│   redis, repl)  │     │                 │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
  helm dependency update   helm repo add
         │                       │
         ▼                       ▼
    helm template          helm template
         │                       │
         └──────────┬────────────┘
                    ▼
              yq image extraction
                    │
                    ▼
            combine & deduplicate
                    │
                    ▼
            JSON array of images
                    │
                    ▼
         GitHub Actions matrix (parallel)
              │   │   │   │   │   │   │
              ▼   ▼   ▼   ▼   ▼   ▼   ▼
           Grype Grype Grype Grype ...
              │   │   │   │   │   │   │
              ▼   ▼   ▼   ▼   ▼   ▼   ▼
            SARIF SARIF SARIF SARIF ...
              │   │   │   │   │   │   │
              ▼   ▼   ▼   ▼   ▼   ▼   ▼
            upload upload upload upload ...
```

## Components

### New File: `.github/workflows/helm-image-scan.yml`

Reusable workflow with:
- Inputs: `tag` (optional, default `main`)
- Jobs:
  - `extract-images`: Templates all charts, extracts images, outputs compact JSON array
  - `scan`: Matrix job using `fromJSON` to scan each image in parallel

### Modified File: `.github/workflows/build-test.yml`

- Added `helm-scan` job calling `helm-image-scan.yml`
- **Removed** the old `scan` job that called `image-scan.yml`

### No New Application Code

Pure CI/CD infrastructure. No source code changes.

## Images Scanned

| Image | Source |
|-------|--------|
| `ghcr.io/replemos/playball.exe:<tag>` | Main chart (app) |
| `docker.io/bitnami/postgresql:latest` | Main chart dependency |
| `docker.io/bitnami/redis:latest` | Main chart dependency |
| `proxy.replicated.com/library/replicated-sdk-image:1.19.3` | Main chart dependency |
| `quay.io/jetstack/cert-manager-cainjector:v1.17.2` | EC extension |
| `quay.io/jetstack/cert-manager-controller:v1.17.2` | EC extension |
| `quay.io/jetstack/cert-manager-startupapicheck:v1.17.2` | EC extension |
| `quay.io/jetstack/cert-manager-webhook:v1.17.2` | EC extension |
| `docker.io/traefik:v3.6.13` | EC extension |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No images found | Matrix skipped, workflow succeeds |
| Helm dep update fails | Workflow fails fast |
| Extension chart template fails | `|| true` — partial results still processed |
| Image scan fails | `fail-build: false`, SARIF still uploaded if possible |
| SARIF upload fails | `if: always()`, partial results reported |
| Private registry image | GHCR login conditional on `ghcr.io` |

## Security Considerations

- All scanned images are from public registries
- GHCR login is conditional (only for app image)
- SARIF reports uploaded to GitHub Security tab

## Testing Strategy

- Test image extraction locally: run `helm template` + `yq` for all three sources
- Verify JSON output is compact single-line (required for `$GITHUB_OUTPUT`)
- Trigger workflow in PR to verify matrix jobs spawn
- Verify SARIF files appear in GitHub Security tab under unique categories
