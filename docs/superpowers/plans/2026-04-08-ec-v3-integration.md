# EC v3 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create KOTS release manifests in `deploy/manifests/` enabling installation of playball.exe via Embedded Cluster v3, with Admin Console UI for configuring bundled vs external PostgreSQL and Redis.

**Architecture:** Four YAML manifests live in `deploy/manifests/` alongside the packaged Helm chart tgz (not checked in). The HelmChart v2 manifest maps KOTS Config template functions to Helm values, keeping the existing `deploy/charts/` entirely unchanged.

**Tech Stack:** Replicated KOTS (`kots.io/v1beta1`, `kots.io/v1beta2`), Embedded Cluster v3 (`embeddedcluster.replicated.com/v1beta1`), Helm, Replicated CLI

---

### Task 1: Create manifests directory scaffold

**Files:**
- Create: `deploy/manifests/.gitignore`
- Create: `deploy/manifests/embedded-cluster-config.yaml`
- Create: `deploy/manifests/kots-app.yaml`

- [ ] **Step 1: Create the manifests directory and .gitignore**

`deploy/manifests/.gitignore`:
```
*.tgz
```

The `.tgz` is a build artifact produced by `helm package` at release time — it must not be committed.

- [ ] **Step 2: Create embedded-cluster-config.yaml**

`deploy/manifests/embedded-cluster-config.yaml`:
```yaml
apiVersion: embeddedcluster.replicated.com/v1beta1
kind: Config
metadata:
  name: playball-exe
spec:
  version: "3.0.0-alpha-31+k8s-1.34"
```

This pins the EC v3 version. No extensions needed — OpenEBS storage is built in to EC v3.

- [ ] **Step 3: Create kots-app.yaml**

`deploy/manifests/kots-app.yaml`:
```yaml
apiVersion: kots.io/v1beta1
kind: Application
metadata:
  name: playball-exe
spec:
  title: playball.exe
  statusInformers:
    - deployment/playball-exe
```

`statusInformers` wires up the Admin Console health display to the main deployment.

- [ ] **Step 4: Commit**

```bash
git add deploy/manifests/
git commit -m "feat: add EC v3 manifests scaffold (ec config + kots app)"
```

---

### Task 2: Create kots-config.yaml

**Files:**
- Create: `deploy/manifests/kots-config.yaml`

- [ ] **Step 1: Create kots-config.yaml**

`deploy/manifests/kots-config.yaml`:
```yaml
apiVersion: kots.io/v1beta1
kind: Config
metadata:
  name: playball-exe
spec:
  groups:
    - name: database
      title: Database
      items:
        - name: postgresql_enabled
          title: Use Bundled PostgreSQL
          type: bool
          default: "1"
        - name: external_postgres_url
          title: External PostgreSQL URL
          help_text: "PostgreSQL connection string, e.g. postgres://user:pass@host:5432/dbname"
          type: password
          when: '{{repl ConfigOptionEquals "postgresql_enabled" "0"}}'

    - name: redis_config
      title: Redis
      items:
        - name: redis_enabled
          title: Use Bundled Redis
          type: bool
          default: "1"
        - name: external_redis_url
          title: External Redis URL
          help_text: "Redis connection string, e.g. redis://host:6379"
          type: password
          when: '{{repl ConfigOptionEquals "redis_enabled" "0"}}'

    - name: secrets
      title: Secrets
      items:
        - name: nextauth_secret
          title: NextAuth Secret
          type: password
          hidden: true
          readonly: false
          value: '{{repl RandomString 32}}'
```

Key points:
- `type: bool` values are stored as `"0"` or `"1"` strings
- `type: password` encrypts the value and masks it in the UI
- `when` on `external_*_url` hides the field when bundled is selected (`"0"` = bundled off)
- `nextauth_secret`: `hidden: true` + `readonly: false` + `value` (not `default`) = generated once, persists across config changes, never shown

- [ ] **Step 2: Commit**

```bash
git add deploy/manifests/kots-config.yaml
git commit -m "feat: add KOTS config for PostgreSQL, Redis, and NextAuth secret"
```

---

### Task 3: Create helmchart.yaml

**Files:**
- Create: `deploy/manifests/helmchart.yaml`

- [ ] **Step 1: Create helmchart.yaml**

`deploy/manifests/helmchart.yaml`:
```yaml
apiVersion: kots.io/v1beta2
kind: HelmChart
metadata:
  name: playball-exe
spec:
  chart:
    name: playball-exe
    chartVersion: 0.1.0
  releaseName: playball-exe
  values:
    postgresql:
      enabled: 'repl{{ ConfigOptionEquals "postgresql_enabled" "1" }}'
    externalDatabase:
      url: 'repl{{ ConfigOption "external_postgres_url" }}'
    redis:
      enabled: 'repl{{ ConfigOptionEquals "redis_enabled" "1" }}'
    externalRedis:
      url: 'repl{{ ConfigOption "external_redis_url" }}'
    nextauth:
      secret: 'repl{{ ConfigOption "nextauth_secret" }}'
```

Key points:
- `spec.chart.name` must match the `name` field in `deploy/charts/Chart.yaml` exactly (`playball-exe`)
- `spec.chart.chartVersion` must match the `version` field in `Chart.yaml` (`0.1.0`)
- `repl{{ }}` prefix (not `{{repl }}`) is used in HelmChart values to avoid conflicts with Helm's own `{{ }}` templating
- `ConfigOptionEquals "postgresql_enabled" "1"` returns `"true"` when bundled is selected, mapping to `postgresql.enabled: true` in Helm

- [ ] **Step 2: Commit**

```bash
git add deploy/manifests/helmchart.yaml
git commit -m "feat: add HelmChart v2 manifest mapping KOTS config to Helm values"
```

---

### Task 4: Package, lint, and create a release

**Files:** No new files — validation and release creation only.

Prerequisites:
- `replicated` CLI installed and authenticated
- `REPLICATED_API_TOKEN` available (pass explicitly — Bash does not inherit shell env vars)
- `helm` installed with chart dependencies available

- [ ] **Step 1: Update chart dependencies**

```bash
helm dependency update deploy/charts
```

Expected: Downloads postgresql, redis, replicated subchart tgzs into `deploy/charts/charts/`. Already present if previously run.

- [ ] **Step 2: Package the chart into the manifests directory**

```bash
helm package deploy/charts -d deploy/manifests
```

Expected output: `Successfully packaged chart and saved it to: deploy/manifests/playball-exe-0.1.0.tgz`

The tgz is excluded from git by `deploy/manifests/.gitignore`.

- [ ] **Step 3: Create and promote the release (with lint)**

`--lint` validates manifests before creating — if lint fails, the release is not created. Fix any reported errors and re-run.

```bash
replicated release create \
  --yaml-dir deploy/manifests \
  --version 0.1.0-ec-v3 \
  --promote Unstable \
  --lint \
  --token <REPLICATED_API_TOKEN> \
  --app <app-slug>
```

Expected output: Release sequence number and confirmation it was promoted to Unstable channel.

- [ ] **Step 5: Clean up the packaged tgz**

```bash
rm deploy/manifests/*.tgz
```

The tgz is a build artifact — it should not linger in the working directory.

- [ ] **Step 6: Commit**

```bash
git add deploy/manifests/
git commit -m "feat: EC v3 integration complete — manifests ready for KOTS release"
```
