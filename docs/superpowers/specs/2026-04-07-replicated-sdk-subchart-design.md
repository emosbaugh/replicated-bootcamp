# Replicated SDK Subchart Design

**Date:** 2026-04-07  
**Branch:** feat/replicated-release-pr-workflow

## Goal

Add the Replicated SDK as a Helm subchart dependency, aliased to hide Replicated branding. The resulting Kubernetes Deployment must be named `<release-name>-sdk`.

## Approach

Use `alias: sdk` in the `Chart.yaml` dependency entry. The alias replaces `.Chart.Name` inside the subchart, so the SDK's fullname template produces `<release-name>-sdk` without any `nameOverride`. Values are scoped under the `sdk:` key, matching the postgresql/redis pattern already in the chart.

## Changes

### `deploy/charts/Chart.yaml`

Add dependency:

```yaml
- name: replicated-sdk
  version: "1.0.0-beta.33"
  repository: oci://registry.replicated.com/library/replicated-sdk
  alias: sdk
  condition: sdk.enabled
```

### `deploy/charts/values.yaml`

Add at the bottom:

```yaml
sdk:
  enabled: true
```

### `deploy/charts/values.schema.json`

Add to `properties`:

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

No `additionalProperties: false` — allows full SDK values passthrough, consistent with the postgresql/redis schema entries.

### Lockfile

Run `helm dependency update deploy/charts` to pull the chart tarball into `deploy/charts/charts/` and regenerate `Chart.lock`.

## Resulting Deployment Name

With `alias: sdk`, the SDK's fullname resolves to `<release-name>-sdk`. For example, a release named `playball` produces a Deployment named `playball-sdk`.
