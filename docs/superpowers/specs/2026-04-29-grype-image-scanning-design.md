# Grype Image Scanning — Design

**Date:** 2026-04-29
**Status:** Approved

## Overview

Add container image vulnerability scanning with Grype to the GitHub Actions pipeline. Scanning blocks PR merges and deployment releases on Medium+ severity CVEs. A daily cron job scans the `main` tag to catch newly-disclosed vulnerabilities in already-shipped images.

## Architecture

A new reusable workflow `image-scan.yml` centralizes all scanning logic. It is called from `build-test.yml` (PRs) and `deploy.yml` (main/tag pushes), and also runs on a cron schedule.

## New Workflow: `.github/workflows/image-scan.yml`

**Triggers:**
- `workflow_call` — accepts a `tag` input (string); called by other workflows with the image tag they just built
- `schedule` — daily at 06:00 UTC, scans `main` tag
- `workflow_dispatch` — manual trigger with optional `tag` input defaulting to `main`

**Permissions:** `packages: read`

**Job: `scan`** (runs on `ubuntu-latest`)

1. Log in to GHCR using `docker/login-action@v3` with `secrets.GITHUB_TOKEN`
2. Run `anchore/scan-action@v6` against `ghcr.io/replemos/playball.exe:<tag>`
   - `fail-build: true`
   - `severity-cutoff: medium`
3. No SARIF upload — pass/fail only

## Changes to `build-test.yml`

Add a `scan` job:

```yaml
scan:
  needs: [build]
  uses: ./.github/workflows/image-scan.yml
  with:
    tag: pr-${{ github.event.pull_request.number }}
  permissions:
    packages: read
  secrets: inherit
```

Update the `release` job's `needs` to include `scan`:

```yaml
needs: [build, lint, scan]
```

This blocks release promotion and all e2e jobs when scanning fails.

## Changes to `deploy.yml`

Add a `scan` job after `docker`:

```yaml
scan:
  needs: [docker]
  uses: ./.github/workflows/image-scan.yml
  with:
    tag: ${{ startsWith(github.ref, 'refs/tags/') && github.ref_name || 'main' }}
  permissions:
    packages: read
  secrets: inherit
```

Update the `release` job's `needs`:

```yaml
needs: [docker, scan]
```

This prevents promoting a vulnerable image to the Unstable or Stable channel.

## Cron Behavior

The `schedule` trigger in `image-scan.yml` runs daily at 06:00 UTC and always scans the `main` tag. Failures appear as failed workflow runs in the Actions tab. No PR blocking — purely advisory for already-deployed images.

## Severity Threshold

`medium` and above. Grype severity levels in scope: Medium, High, Critical. Low and Negligible are ignored.

## Out of Scope

- SARIF upload / GitHub Security tab integration (future enhancement)
- Slack or email alerting on cron failures (future enhancement)
- Per-CVE ignore lists / `.grype.yaml` suppression file (can add if base-image CVEs cause noise)
