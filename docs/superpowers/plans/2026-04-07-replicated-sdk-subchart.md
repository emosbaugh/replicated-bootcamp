# Replicated SDK Subchart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Replicated SDK as a Helm subchart dependency aliased to `sdk` so the resulting Deployment is named `<release-name>-sdk` with no Replicated branding visible in resource names.

**Architecture:** Add `replicated-sdk` as a Chart.yaml dependency with `alias: sdk` and `condition: sdk.enabled`. The alias replaces `.Chart.Name` inside the SDK subchart, causing its fullname template to produce `<release-name>-sdk`. Values and schema are updated to match the existing postgresql/redis pattern.

**Tech Stack:** Helm 3, OCI chart registry (`oci://registry.replicated.com/library/replicated-sdk`)

---

### Task 1: Add SDK dependency to Chart.yaml

**Files:**
- Modify: `deploy/charts/Chart.yaml`

- [ ] **Step 1: Add the dependency block**

Open `deploy/charts/Chart.yaml`. After the redis dependency entry, add:

```yaml
  - name: replicated-sdk
    version: "1.0.0-beta.33"
    repository: oci://registry.replicated.com/library/replicated-sdk
    alias: sdk
    condition: sdk.enabled
```

The full `dependencies:` section should now read:

```yaml
dependencies:
  - name: postgresql
    version: "18.5.15"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: postgresql.enabled
  - name: redis
    version: "25.3.9"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: redis.enabled
  - name: replicated-sdk
    version: "1.0.0-beta.33"
    repository: oci://registry.replicated.com/library/replicated-sdk
    alias: sdk
    condition: sdk.enabled
```

- [ ] **Step 2: Pull the chart tarball**

```bash
helm dependency update deploy/charts
```

Expected: output ends with `...Successfully got an update from the "..." chart repository` and a new file `deploy/charts/charts/sdk-1.0.0-beta.33.tgz` (or similar) appears alongside the existing postgresql and redis tarballs. `Chart.lock` is updated.

- [ ] **Step 3: Verify lint still passes (no values yet — expected to warn/fail on schema)**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: may produce a warning about unknown key `sdk` if schema is strict — that's fine, we fix it in Task 2. A hard error here means the dependency pull failed; re-run `helm dependency update`.

- [ ] **Step 4: Commit**

```bash
git add deploy/charts/Chart.yaml deploy/charts/Chart.lock deploy/charts/charts/
git commit -m "feat: add Replicated SDK as aliased subchart dependency"
```

---

### Task 2: Add sdk values and schema

**Files:**
- Modify: `deploy/charts/values.yaml`
- Modify: `deploy/charts/values.schema.json`

- [ ] **Step 1: Add sdk block to values.yaml**

Append to the bottom of `deploy/charts/values.yaml`:

```yaml
sdk:
  enabled: true
```

- [ ] **Step 2: Add sdk property to values.schema.json**

In `deploy/charts/values.schema.json`, find the `"nextauth"` property entry (currently the last entry in `"properties"`). After the closing `}` of the `nextauth` block and before the closing `}` of `"properties"`, add a comma and the sdk entry:

```json
    "sdk": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean"
        }
      }
    }
```

The end of the `properties` block should look like:

```json
    "nextauth": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "secret": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      },
      "required": ["secret", "url"]
    },
    "sdk": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean"
        }
      }
    }
  },
```

Note: no `additionalProperties: false` on `sdk` — this allows full SDK values passthrough, consistent with the postgresql and redis schema entries.

- [ ] **Step 3: Verify helm lint passes**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 4: Verify the SDK Deployment name via helm template**

```bash
helm template myapp deploy/charts --set nextauth.secret=test | grep -A2 'kind: Deployment'
```

Expected output includes a Deployment named `myapp-sdk` (from the SDK subchart) alongside `myapp` (the main app):

```
kind: Deployment
metadata:
  name: myapp-sdk
---
...
kind: Deployment
metadata:
  name: myapp
```

- [ ] **Step 5: Verify sdk can be disabled**

```bash
helm template myapp deploy/charts --set nextauth.secret=test --set sdk.enabled=false | grep -c 'kind: Deployment'
```

Expected: `1` (only the main app Deployment, SDK suppressed)

- [ ] **Step 6: Commit**

```bash
git add deploy/charts/values.yaml deploy/charts/values.schema.json
git commit -m "feat: add sdk enabled toggle to values and schema"
```
