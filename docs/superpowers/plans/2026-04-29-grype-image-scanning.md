# Grype Image Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Grype container image scanning to GitHub Actions, blocking PRs and deploys on Medium+ CVEs, with a daily cron scan of the `main` tag.

**Architecture:** A new reusable `image-scan.yml` workflow handles all scanning logic and is called from `build-test.yml` (PRs) and `deploy.yml` (pushes to main/tags), plus a daily schedule trigger that scans the live `main` image.

**Tech Stack:** GitHub Actions, `anchore/scan-action` (Grype), GHCR (`ghcr.io/replemos/playball.exe`)

---

## File Map

| Action | File |
|--------|------|
| Create | `.github/workflows/image-scan.yml` |
| Modify | `.github/workflows/build-test.yml` |
| Modify | `.github/workflows/deploy.yml` |

---

### Task 1: Create `image-scan.yml`

**Files:**
- Create: `.github/workflows/image-scan.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/image-scan.yml` with the following content:

```yaml
name: Image Scan

on:
  workflow_call:
    inputs:
      tag:
        description: Image tag to scan
        required: true
        type: string
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
    inputs:
      tag:
        description: Image tag to scan
        required: false
        default: main
        type: string

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      packages: read
    steps:
      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Scan image with Grype
        uses: anchore/scan-action@v6
        with:
          image: ghcr.io/replemos/playball.exe:${{ inputs.tag || 'main' }}
          fail-build: true
          severity-cutoff: medium
          output-format: table
```

- [ ] **Step 2: Lint the new workflow**

```bash
actionlint .github/workflows/image-scan.yml
```

Expected: no errors. If `actionlint` flags `inputs.tag || 'main'` as an issue (it uses GitHub expressions, not JS), rewrite to:

```yaml
image: ghcr.io/replemos/playball.exe:${{ inputs.tag != '' && inputs.tag || 'main' }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/image-scan.yml
git commit -m "feat: add reusable Grype image scanning workflow"
```

---

### Task 2: Wire `image-scan.yml` into `build-test.yml`

**Files:**
- Modify: `.github/workflows/build-test.yml`

- [ ] **Step 1: Add the `scan` job after the `build` job**

Open `.github/workflows/build-test.yml`. After the `build` job block (ends around line 19 with `secrets: inherit`), add:

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

- [ ] **Step 2: Add `scan` to the `release` job's `needs`**

Find the `release` job. Its current `needs` line is:

```yaml
    needs: [build, lint]
```

Change it to:

```yaml
    needs: [build, lint, scan]
```

This ensures release promotion and all downstream e2e jobs are blocked when scanning fails.

- [ ] **Step 3: Lint the modified workflow**

```bash
actionlint .github/workflows/build-test.yml
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build-test.yml
git commit -m "feat: block PR release on Grype image scan failure"
```

---

### Task 3: Wire `image-scan.yml` into `deploy.yml`

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add the `scan` job after the `docker` job**

Open `.github/workflows/deploy.yml`. After the `docker` job block (ends around line 26 with `secrets: inherit`), add:

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

- [ ] **Step 2: Add `scan` to the `release` job's `needs`**

Find the `release` job. Its current `needs` line is:

```yaml
    needs: docker
```

Change it to:

```yaml
    needs: [docker, scan]
```

This prevents promoting a vulnerable image to the Unstable or Stable Replicated channel.

- [ ] **Step 3: Lint the modified workflow**

```bash
actionlint .github/workflows/deploy.yml
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: block deploy release on Grype image scan failure"
```

---

## Verification

After merging, open a test PR and confirm:

1. The `scan` job appears in the PR checks timeline, runs after `build`
2. The `release` job does not start until `scan` passes
3. Visit **Actions → Image Scan** in the repo to see the scheduled runs listed (first run at next 06:00 UTC)
4. To manually trigger a scan: **Actions → Image Scan → Run workflow**, leave tag as `main`

## Notes

- **`anchore/scan-action@v6`**: Verify this is the current major version at [github.com/anchore/scan-action/releases](https://github.com/anchore/scan-action/releases) before merging. Substitute the correct version if needed.
- **Base image noise**: If `node:20-alpine` CVEs cause frequent failures for issues outside your control, add a `.grype.yaml` ignore list at the repo root (out of scope for this plan, but straightforward to add).
- **Cron failures**: Failed scheduled runs show up in the Actions tab but do not create GitHub notifications by default. Configure notification settings in the repo **Settings → Notifications** if you want email/Slack alerts.
