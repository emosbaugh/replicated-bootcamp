# EC v3 Integration Design

**Date:** 2026-04-08

## Overview

Add Embedded Cluster v3 support to the playball.exe release by creating KOTS release manifests. This enables end customers to install the application as a self-contained Kubernetes appliance via EC v3, with Admin Console UI for configuring PostgreSQL and Redis (bundled vs external).

## Directory Structure

```
deploy/manifests/
  kots-app.yaml               # Application kind — title + status informers
  kots-config.yaml            # Config kind — PostgreSQL/Redis toggles + external URLs
  helmchart.yaml              # HelmChart v2 — maps config values to Helm values
  embedded-cluster-config.yaml  # EmbeddedClusterConfig — EC v3 version pin
```

The existing `deploy/charts/` is unchanged.

## Files

### `embedded-cluster-config.yaml`

Minimal EC v3 version pin. No extensions needed (OpenEBS storage is built in).

```yaml
apiVersion: embeddedcluster.replicated.com/v1beta1
kind: Config
metadata:
  name: playball-exe
spec:
  version: "3.0.0-alpha-31+k8s-1.34"
```

### `kots-app.yaml`

Minimal Application kind for Admin Console branding and health display.

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

### `kots-config.yaml`

Two groups exposing PostgreSQL and Redis configuration. Each has a boolean toggle (default: bundled) and a conditional URL field shown only when the toggle is off.

**PostgreSQL group:**
- `postgresql_enabled` — bool, default `1`
- `external_postgres_url` — **type: password** (connection strings contain credentials), shown only when `postgresql_enabled == 0`

**Redis group:**
- `redis_enabled` — bool, default `1`
- `external_redis_url` — **type: password**, shown only when `redis_enabled == 0`

Password type is used (not text) because connection strings contain credentials — KOTS encrypts and masks password fields. The `when` property hides the URL field when bundled is selected.

**Secrets group:**
- `nextauth_secret` — type: password, `hidden: true`, `readonly: false`, `value: '{{repl RandomString 32}}'` — auto-generated once on install, persists across config changes, never shown to users. Maps to `nextauth.secret`.

### `helmchart.yaml`

HelmChart v2 (`kots.io/v1beta2`) pointing at the existing chart. Maps KOTS config options to Helm values via template functions:

```yaml
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

## Release Process

The Helm chart `.tgz` must be packaged and placed alongside the KOTS manifests before creating a release — the platform matches it by name/version to the HelmChart CR. The `deploy/manifests/` directory is used only as a staging area and the tgz is not checked in.

```bash
# Package the chart into the manifests directory
helm dependency update deploy/charts
helm package deploy/charts -d deploy/manifests

# Create and promote the release
replicated release create --yaml-dir deploy/manifests --version <version> --promote <channel>

# Clean up the packaged tgz
rm deploy/manifests/*.tgz
```

## Out of Scope

- Air gap support
- Custom ingress or node roles
- Additional KOTS config fields beyond PostgreSQL/Redis
