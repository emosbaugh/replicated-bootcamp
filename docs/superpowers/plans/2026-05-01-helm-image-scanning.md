# Helm Chart Image Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI workflow to extract all container images from the Helm chart and its dependencies, scan each with Grype, and upload per-image SARIF reports to GitHub Security tab.

**Architecture:** A reusable `helm-image-scan.yml` workflow extracts images from `helm template` output using `yq`, then uses a GitHub Actions matrix to scan each image in parallel with Grype. The `build-test.yml` workflow calls this on every PR.

**Tech Stack:** GitHub Actions, Helm, yq, Grype (anchore/scan-action), GitHub SARIF upload (codeql-action/upload-sarif)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `.github/workflows/helm-image-scan.yml` | **Create** | Reusable workflow: extracts images from Helm chart, scans each with Grype, uploads SARIF |
| `.github/workflows/build-test.yml` | **Modify** | Add `helm-scan` job that calls `helm-image-scan.yml` on PRs |

---

## Task 1: Create `helm-image-scan.yml` Workflow

**Files:**
- **Create:** `.github/workflows/helm-image-scan.yml`

- [ ] **Step 1: Write the workflow file**

```yaml
name: Helm Image Scan

on:
  workflow_call:
    inputs:
      tag:
        description: Image tag for the app image
        required: false
        default: main
        type: string
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:
    inputs:
      tag:
        description: Image tag for the app image
        required: false
        default: main
        type: string

jobs:
  extract-images:
    runs-on: ubuntu-latest
    outputs:
      images: ${{ steps.extract.outputs.images }}
    steps:
      - uses: actions/checkout@v6

      - name: Install yq
        uses: mikefarah/yq@v4
        with:
          install: 'yes'

      - name: Update Helm dependencies
        run: make helm-dep-update

      - name: Extract images from Helm chart
        id: extract
        run: |
          # Template the chart with all dependencies enabled and the app image tag
          images=$(helm template playball-exe deploy/charts \
            --set nextauth.secret=test \
            --set nextauth.url=https://example.com \
            --set postgresql.enabled=true \
            --set redis.enabled=true \
            --set replicated.enabled=true \
            --set image.tag=${{ inputs.tag != '' && inputs.tag || 'main' }} \
            | yq '.. | .image? | select(type == "!!str")' \
            | sort -u \
            | jq -R . \
            | jq -s .)
          
          echo "images=$images" >> "$GITHUB_OUTPUT"
          echo "Found images: $images"

  scan:
    needs: [extract-images]
    runs-on: ubuntu-latest
    if: ${{ needs.extract-images.outputs.images != '[]' }}
    strategy:
      matrix:
        image: ${{ fromJSON(needs.extract-images.outputs.images) }}
    timeout-minutes: 15
    permissions:
      packages: read
      security-events: write
    steps:
      - name: Log in to GitHub Container Registry
        if: contains(matrix.image, 'ghcr.io')
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Scan image with Grype (SARIF)
        uses: anchore/scan-action@v7
        with:
          image: ${{ matrix.image }}
          fail-build: false
          only-fixed: true
          severity-cutoff: medium
          output-format: sarif
          output-file: results.sarif

      - name: Upload SARIF to GitHub Security tab
        uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: results.sarif
          category: helm-image-${{ matrix.image }}

      - name: Scan image with Grype (table output)
        uses: anchore/scan-action@v7
        with:
          image: ${{ matrix.image }}
          fail-build: false
          only-fixed: true
          severity-cutoff: medium
          output-format: table
```

- [ ] **Step 2: Verify workflow syntax locally**

Run: `cd /Users/ethan/go/src/github.com/emosbaugh/replicated-bootcamp/.worktrees/feat/helm-image-scanning && actionlint .github/workflows/helm-image-scan.yml 2>/dev/null || echo "actionlint not installed, skipping syntax check"`
Expected: No errors (or skipped message)

- [ ] **Step 3: Commit the new workflow**

```bash
git add .github/workflows/helm-image-scan.yml
git commit -m "feat(ci): add helm chart image scanning with SARIF upload"
```

---

## Task 2: Modify `build-test.yml` to Call Helm Scan

**Files:**
- **Modify:** `.github/workflows/build-test.yml`

- [ ] **Step 1: Add `helm-scan` job after the existing `scan` job**

Find the `scan:` job in `.github/workflows/build-test.yml` and add after it:

```yaml
  helm-scan:
    needs: [build]
    uses: ./.github/workflows/helm-image-scan.yml
    permissions:
      packages: read
      security-events: write
    with:
      tag: pr-${{ github.event.pull_request.number }}
    secrets: inherit
```

**Old context to find:**
```yaml
  scan:
    needs: [build]
    uses: ./.github/workflows/image-scan.yml
    permissions:
      packages: read
      security-events: write
    with:
      tag: pr-${{ github.event.pull_request.number }}
    secrets: inherit
```

**New content:**
```yaml
  scan:
    needs: [build]
    uses: ./.github/workflows/image-scan.yml
    permissions:
      packages: read
      security-events: write
    with:
      tag: pr-${{ github.event.pull_request.number }}
    secrets: inherit

  helm-scan:
    needs: [build]
    uses: ./.github/workflows/helm-image-scan.yml
    permissions:
      packages: read
      security-events: write
    with:
      tag: pr-${{ github.event.pull_request.number }}
    secrets: inherit
```

- [ ] **Step 2: Verify the YAML is valid**

Run: `cd /Users/ethan/go/src/github.com/emosbaugh/replicated-bootcamp/.worktrees/feat/helm-image-scanning && actionlint .github/workflows/build-test.yml 2>/dev/null || echo "actionlint not installed, skipping syntax check"`
Expected: No errors (or skipped message)

- [ ] **Step 3: Commit the modification**

```bash
git add .github/workflows/build-test.yml
git commit -m "feat(ci): add helm-scan job to build-test workflow"
```

---

## Task 3: Verify Image Extraction Locally

**Files:**
- None (local verification only)

- [ ] **Step 1: Test helm template image extraction**

Run:
```bash
cd /Users/ethan/go/src/github.com/emosbaugh/replicated-bootcamp/.worktrees/feat/helm-image-scanning
make helm-dep-update
helm template playball-exe deploy/charts \
  --set nextauth.secret=test \
  --set nextauth.url=https://example.com \
  --set postgresql.enabled=true \
  --set redis.enabled=true \
  --set replicated.enabled=true \
  --set image.tag=main \
  | yq '.. | .image? | select(type == "!!str")' \
  | sort -u
```

Expected: A list of unique image strings including at minimum:
- `ghcr.io/replemos/playball.exe:main`
- `docker.io/bitnami/postgresql:...`
- `docker.io/bitnami/redis:...`
- `replicated/replicated-sdk:...`

- [ ] **Step 2: Test JSON array output**

Run the same command but piped to `jq`:
```bash
helm template playball-exe deploy/charts \
  --set nextauth.secret=test \
  --set nextauth.url=https://example.com \
  --set postgresql.enabled=true \
  --set redis.enabled=true \
  --set replicated.enabled=true \
  --set image.tag=main \
  | yq '.. | .image? | select(type == "!!str")' \
  | sort -u \
  | jq -R . \
  | jq -s .
```

Expected: Valid JSON array like `["image1", "image2", ...]`

- [ ] **Step 3: Commit verification results (if needed)**

If the extraction works correctly, no code changes needed. If any images are missing, adjust the `yq` query or Helm values and commit fixes.

---

## Self-Review Checklist

After completing all tasks:

1. [ ] **Spec coverage:** Does `helm-image-scan.yml` implement image extraction, matrix scanning, and SARIF upload? Yes.
2. [ ] **Spec coverage:** Does `build-test.yml` call the new workflow on PRs? Yes.
3. [ ] **Placeholder scan:** Any TBD, TODO, or incomplete sections? No.
4. [ ] **Type consistency:** Do matrix inputs/outputs match? `images` JSON output fed to `fromJSON` in matrix — consistent.
5. [ ] **Test verification:** Was local image extraction tested? Yes.

---

## Execution Options

**Plan complete.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach would you prefer?
