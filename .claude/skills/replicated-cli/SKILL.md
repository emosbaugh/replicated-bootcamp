---
name: replicated-cli
description: Use when running Replicated CLI commands to manage apps, channels, releases, customers, or making direct Vendor API calls with `replicated api`
---

# Replicated CLI

## Authentication

Pass `--token $REPLICATED_API_TOKEN` to every command, or configure a profile. The env var does **not** auto-load — pass it explicitly.

The `.replicated` config in the repo root sets `appSlug` and `manifests`/`charts` paths, so `release create` and `release lint` do **not** need `--app` or `--yaml-dir`. Other commands (channel, customer, registry) still require `--app`.

```bash
replicated <command> --token $REPLICATED_API_TOKEN --app <app-slug>
```

Global flags available on all commands:

| Flag | Description |
|------|-------------|
| `--token string` | Vendor API token |
| `--app string` | App slug or ID |
| `--profile string` | Named auth profile |
| `--debug` | Debug output |

## App

```bash
replicated app ls --token $REPLICATED_API_TOKEN
replicated app create --name "My App" --token $REPLICATED_API_TOKEN
```

## Channel

```bash
# List channels
replicated channel ls --token $REPLICATED_API_TOKEN --app <slug>

# Inspect a channel (get channel ID, current release, etc.)
replicated channel inspect <channel-id> --token $REPLICATED_API_TOKEN --app <slug>
```

## Release

```bash
# See docs/testing-ec3.md for the full workflow. Summary:
# 1. Stamp versions into Chart.yaml, helmchart.yaml, and values.yaml
make package-charts VERSION="$RELEASE_VERSION" IMAGE_TAG="$IMAGE_TAG"

# 2. Pull EC extension chart archives into deploy/manifests/ (cert-manager, traefik)
#    Versions are read from embedded-cluster-config.yaml — no duplication.
make bundle-extensions

# 3. Create and promote the release
#    No --yaml-dir or --app needed: .replicated config provides both.
replicated release create --version "$RELEASE_VERSION" --promote Unstable --token $REPLICATED_API_TOKEN

# Promote an existing release sequence to a channel
replicated release promote <sequence> <channel-id> --version 1.0.0 --token $REPLICATED_API_TOKEN --app <slug>

# List releases
replicated release ls --token $REPLICATED_API_TOKEN --app <slug>
```

`release create` key flags:

| Flag | Description |
|------|-------------|
| `--version string` | Version label |
| `--promote string` | Channel name or ID to promote to |
| `--ensure-channel` | Create channel if it doesn't exist |
| `--lint` | Lint manifests before creating |
| `--required` | Mark release as required (blocks skip) |
| `--release-notes string` | Markdown release notes |

## Customer

```bash
# Create a customer
replicated customer create --name "Acme Inc" --channel stable --type trial --expires-in 720h \
  --token $REPLICATED_API_TOKEN --app <slug>

# List customers
replicated customer ls --token $REPLICATED_API_TOKEN --app <slug>

# Download a license file
replicated customer download-license --customer <id> --token $REPLICATED_API_TOKEN --app <slug>
```

License types: `dev`, `trial`, `paid`, `community`, `test`

Feature flags: `--airgap`, `--snapshot`, `--helm-install`, `--kots-install`, `--embedded-cluster-download`, and more.

## Registry

```bash
replicated registry ls --token $REPLICATED_API_TOKEN --app <slug>
```

## Ad-hoc Vendor API Calls

Use `replicated api` to call any Vendor API endpoint directly:

```bash
# GET
replicated api get /v3/apps --token $REPLICATED_API_TOKEN

# POST — create an app
replicated api post /v3/app --token $REPLICATED_API_TOKEN \
  --body '{"name":"My App"}'

# PATCH / PUT
replicated api patch /v3/app/<app-id> --token $REPLICATED_API_TOKEN \
  --body '{"name":"New Name"}'
```

Base URL is implied — pass only the path starting with `/v3/...`.

API reference: https://replicated-vendor-api.readme.io/reference/createapp

Common endpoints:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v3/apps` | List all apps |
| POST | `/v3/app` | Create an app |
| GET | `/v3/app/<id>/channels` | List channels |
| GET | `/v3/app/<id>/releases` | List releases |
| POST | `/v3/app/<id>/release` | Create a release |

## Common Mistakes

- **EC releases require bundled extension charts**: run `make package-charts` then `make bundle-extensions` before `release create`. `bundle-extensions` pulls cert-manager and traefik archives into `deploy/manifests/` so EC3 can find them at install time. See `docs/testing-ec3.md` for the full workflow. Without these, the install fails with "no chart archive found for ...".
- Forgetting `--token` — the CLI will fail with an auth error; always pass it explicitly
- Using `--yaml` instead of `--yaml-dir` for multi-file manifests
- Passing a channel name to `release promote` — it requires the channel **ID**, not name (use `channel ls` to find it)
- **Semver-enabled channels**: If a channel has semver enabled, promoting a release with a version lower than the channel's current version will silently do nothing (the CLI reports success but the channel doesn't update). Always run `channel inspect <id>` first to check the current version, then use a version string that is strictly greater. Example: if current is `2026.99.2-foo`, use `2026.99.3` or higher.
