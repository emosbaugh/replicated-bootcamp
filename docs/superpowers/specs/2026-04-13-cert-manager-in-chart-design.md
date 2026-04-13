# cert-manager Resources in Chart + Route 53 DNS-01

**Date:** 2026-04-13
**Status:** Approved

## Problem

Four cert-manager manifest files live in `deploy/manifests/` as raw app manifests:

- `cert-manager-certificate.yaml` — `Certificate` (namespace: traefik)
- `cert-manager-issuer.yaml` — `ClusterIssuer` x2 (cluster-scoped)
- `cert-manager-tls-secret.yaml` — `Secret` (namespace: traefik, manual TLS)
- `cert-manager-tlsstore.yaml` — `TLSStore` (namespace: traefik)

Only kots.io kinds should live in `deploy/manifests/`. These resources must move into the Helm chart. Additionally, the existing Let's Encrypt support only uses HTTP-01 (via Traefik); we need to add DNS-01 via Route 53 for customers using a Route 53-hosted domain in a separate AWS account.

## Approach

Add cert-manager templates directly to the existing `deploy/charts/` chart. No sub-chart or additional HelmChart manifest. Cross-namespace resources (`namespace: traefik`, `namespace: cert-manager`) are acceptable in Helm chart templates.

Wire all cert-manager config through `kots-config.yaml` → `helmchart.yaml` values → chart templates, consistent with how postgresql/redis/ingress config is handled today.

## kots-config.yaml Changes

### tls_mode — new fourth option

| value | label |
|---|---|
| `self_signed` | Automatic - Self-Signed |
| `lets_encrypt` | Automatic - Let's Encrypt (HTTP-01) |
| `lets_encrypt_dns01` | Automatic - Let's Encrypt (DNS-01 / Route 53) ← new |
| `manual` | Manual Upload |

### acme_email — updated when condition

Currently shown only for `lets_encrypt`. Updated to show for both `lets_encrypt` and `lets_encrypt_dns01`:

```
when: '{{repl or (ConfigOptionEquals "tls_mode" "lets_encrypt") (ConfigOptionEquals "tls_mode" "lets_encrypt_dns01")}}'
```

### New config items (ingress group, when tls_mode = lets_encrypt_dns01)

| name | type | required | description |
|---|---|---|---|
| `route53_hosted_zone_id` | text | yes | Route 53 Hosted Zone ID (e.g. Z0123456789ABC) |
| `route53_access_key_id` | text | yes | IAM access key ID with Route 53 permissions |
| `route53_secret_access_key` | password | yes | IAM secret access key |

## Chart Templates (new files)

### `cert-manager-issuer.yaml`

ClusterIssuer resources (cluster-scoped, no namespace field).

- `selfsigned` ClusterIssuer — always created.
- `letsencrypt` ClusterIssuer — created when mode is `lets_encrypt` or `lets_encrypt_dns01`. Both modes use the same issuer name so the Certificate issuerRef needs no branching.
  - HTTP-01 mode: `http01.ingress.ingressClassName: traefik`
  - DNS-01 mode: `dns01.route53` with `hostedZoneID`, `region: us-east-1` (hardcoded; Route 53 is global), and secret refs pointing to `cert-manager-route53-credentials` in the `cert-manager` namespace.

### `cert-manager-resources.yaml`

Namespaced resources, all in `namespace: traefik`.

- `Certificate` (traefik-default-tls) — excluded when mode is `manual`. `dnsNames` uses `tls.hostname` (falls back to `cluster.local`). `issuerRef` is `letsencrypt` when mode is `lets_encrypt` or `lets_encrypt_dns01`, otherwise `selfsigned`.
- `TLSStore` (default) — always present; points to `traefik-default-tls` secret.
- `Secret` (traefik-default-tls, type `kubernetes.io/tls`) — only when mode is `manual`; holds `.Values.certManager.manual.cert` and `.Values.certManager.manual.key`.

### `cert-manager-route53-secret.yaml`

A single `Secret` in `namespace: cert-manager`, created only when mode is `lets_encrypt_dns01`.

```
name: cert-manager-route53-credentials
keys: access-key-id, secret-access-key
source: .Values.certManager.acme.dns01.route53.accessKeyId / .secretAccessKey
```

## values.yaml

New `certManager` block added:

```yaml
certManager:
  enabled: true          # set false to skip all cert-manager resources (ClusterIssuers, Certificate, TLSStore, credentials secret)
  mode: self_signed      # self_signed | lets_encrypt | lets_encrypt_dns01 | manual
  acme:
    email: ""
    dns01:
      route53:           # only provider supported today; add siblings (cloudflare, etc.) later
        hostedZoneId: ""
        accessKeyId: ""
        secretAccessKey: ""
  manual:
    cert: ""             # base64 PEM
    key: ""              # base64 PEM
```

All three cert-manager template files are gated behind `{{- if .Values.certManager.enabled }}`. When disabled, no cert-manager CRDs, Secrets, or TLSStore resources are created — useful for standalone chart installs without cert-manager present.

The existing `ingress.tls` array in values.yaml is unrelated (unused by KOTS install) and is left as-is.

## helmchart.yaml Changes

New `certManager` block added under `spec.values`:

```yaml
certManager:
  mode: 'repl{{ ConfigOption "tls_mode" }}'
  acme:
    email: 'repl{{ ConfigOption "acme_email" }}'
    dns01:
      route53:
        hostedZoneId: 'repl{{ ConfigOption "route53_hosted_zone_id" }}'
        accessKeyId: 'repl{{ ConfigOption "route53_access_key_id" }}'
        secretAccessKey: 'repl{{ ConfigOption "route53_secret_access_key" }}'
  manual:
    cert: 'repl{{ ConfigOption "tls_cert" }}'
    key: 'repl{{ ConfigOption "tls_key" }}'
```

Note: `certManager.enabled` is not set in `helmchart.yaml` — it defaults to `true` in `values.yaml` and is not user-configurable via KOTS (it's a chart-level deployment toggle, not an installer config option).

## Files Deleted

All four cert-manager files removed from `deploy/manifests/`:

- `cert-manager-certificate.yaml`
- `cert-manager-issuer.yaml`
- `cert-manager-tls-secret.yaml`
- `cert-manager-tlsstore.yaml`

## Out of Scope

- Cross-account IAM role assumption (instance profile + STS) — credentials are stored as a Kubernetes Secret; IAM user access keys are the supported credential type.
- Making Route 53 region configurable — `us-east-1` works for all Route 53 hosted zones.
- HTTP-01 and DNS-01 solvers active simultaneously.
