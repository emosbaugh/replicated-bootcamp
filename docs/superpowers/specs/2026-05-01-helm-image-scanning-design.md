# Helm Chart Image Scanning with SARIF Upload

> **Status:** Approved for implementation
> **Date:** 2026-05-01
> **Branch:** feat/helm-image-scanning

## Summary

Add CI/CD capability to extract all container images from the playball-exe Helm chart (including subchart dependencies: PostgreSQL, Redis, Replicated), scan them for vulnerabilities using Grype, and upload SARIF reports to the GitHub Security tab.

## Background

The project already scans the main application image (`ghcr.io/replemos/playball.exe`) in `.github/workflows/image-scan.yml`. However, the Helm chart (`deploy/charts/Chart.yaml`) declares dependencies on:

- PostgreSQL (Bitnami)
- Redis (Bitnami)
- Replicated (library)

These dependency images are not currently scanned. When the chart is deployed, these images run in the cluster and represent a security surface area that should be monitored.

## Goals

1. Extract all unique container images referenced by the Helm chart and its subchart dependencies
2. Scan each extracted image for vulnerabilities using Grype (same tool as current app scan)
3. Generate SARIF reports for each image
4. Upload SARIF reports to GitHub Security tab with per-image categories
5. Never fail the build on vulnerabilities (report-only, matching current behavior)
6. Run on every PR and on a daily schedule (matching current `image-scan.yml` triggers)

## Non-Goals

- Fix or patch vulnerabilities in dependency images
- Block PRs based on vulnerability findings
- Scan images at runtime in the cluster
- Generate custom SBOMs (Grype does this internally)
- Replace the existing `image-scan.yml` (complement it)

## Architecture

### Image Extraction

1. `helm dependency update deploy/charts` — fetches subcharts from OCI registries
2. `helm template deploy/charts` — renders all manifests with dependencies enabled and the app image tag injected
3. `yq '.. | .image? | select(.)' | grep -v '^---$'` — recursively extracts all `image:` fields from rendered YAML, filtering out document separators
4. `sort -u` — deduplicates images
5. JSON array output — feeds GitHub Actions matrix strategy

**Important:** The chart values hardcode Replicated proxy registries (`images.emosbaugh.be/...`). For CI scanning, we override these to upstream registries so images are publicly accessible:
- `--set image.registry=ghcr.io`
- `--set postgresql.image.registry=docker.io`
- `--set redis.image.registry=docker.io`
- `--set replicated.image.registry=proxy.replicated.com`

### Scanning

6. Matrix job — one parallel job per unique image
7. Each job runs `anchore/scan-action@v7` with `output-format: sarif`
8. Each job uploads SARIF via `github/codeql-action/upload-sarif@v4` with unique category

### Data Flow

```
Chart.yaml + values.yaml
       |
       v
helm dependency update
       |
       v
helm template (with upstream registries)
       |
       v
yq image extraction
       |
       v
JSON array of images
       |
       v
GitHub Actions matrix (parallel)
       |       |       |
       v       v       v
    Grype   Grype   Grype
       |       |       |
       v       v       v
  SARIF   SARIF   SARIF
       |       |       |
       v       v       v
   upload  upload  upload
```

## Components

### New File: `.github/workflows/helm-image-scan.yml`

Reusable workflow with:
- Inputs: `tag` (optional, default `main`)
- Jobs:
  - `extract-images`: Outputs JSON array of images
  - `scan`: Matrix job using `fromJSON` to scan each image

### Modified File: `.github/workflows/build-test.yml`

Add `helm-scan` job:
- Needs: `[build]`
- Uses: `./.github/workflows/helm-image-scan.yml`
- Passes: `tag: pr-${{ github.event.pull_request.number }}`

### No New Application Code

This is purely CI/CD infrastructure. No source code changes needed.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No images found | Matrix skipped, workflow succeeds |
| Helm dep update fails | Workflow fails fast (broken subchart config) |
| Image scan fails | `fail-build: false`, SARIF still uploaded if possible |
| SARIF upload fails | `if: always()`, partial results reported |
| Private registry image | Add registry login step (currently all public) |

## Security Considerations

- All scanned images are from public registries (Docker Hub/bitnami, GHCR, proxy.replicated.com)
- GHCR login handled by existing `docker/login-action` for app image
- SARIF reports uploaded to GitHub Security tab (same permissions as existing scan)

## Testing Strategy

- Verify `helm-image-scan.yml` syntax with `actionlint` (if available) or by triggering workflow
- Test image extraction locally: `make helm-dep-update && helm template ... | yq ...`
- Verify matrix jobs are spawned correctly in PR
- Verify SARIF files appear in GitHub Security tab under unique categories
