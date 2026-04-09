# cert-manager + HTTPS Design

**Date:** 2026-04-09
**Status:** Approved

## Overview

Add cert-manager as an EC extension to issue a self-signed TLS certificate, configure Traefik to terminate HTTPS on NodePort 443, and redirect all HTTP traffic to HTTPS.

## Components

### 1. cert-manager EC Extension

Add cert-manager to `embedded-cluster-config.yaml` `extensions.helmCharts` using the Jetstack Helm chart. cert-manager must be installed before Traefik so its CRDs exist when the Certificate resource is applied. This is enforced via the `weight` field — cert-manager gets a higher weight than Traefik.

```yaml
- chart:
    name: cert-manager
    chartVersion: "v1.17.2"
  releaseName: cert-manager
  namespace: cert-manager
  weight: 10
  values:
    crds:
      enabled: true
```

Traefik keeps `weight: 0` (default), so cert-manager (weight 10) installs first.

### 2. ClusterIssuer (KOTS manifest)

A `ClusterIssuer` with `selfSigned: {}` — cluster-scoped so no namespace dependency. Deployed as a raw manifest in `deploy/manifests/`.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned
spec:
  selfSigned: {}
```

### 3. Certificate (KOTS manifest, `traefik` namespace)

A `Certificate` resource in the `traefik` namespace referencing the ClusterIssuer. The `dnsNames` field uses the KOTS `hostname` config option. Creates secret `traefik-default-tls` in the `traefik` namespace.

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: traefik-default-tls
  namespace: traefik
spec:
  secretName: traefik-default-tls
  dnsNames:
    - 'repl{{ ConfigOption "hostname" }}'
  issuerRef:
    name: selfsigned
    kind: ClusterIssuer
```

### 4. Traefik TLSStore (KOTS manifest, `traefik` namespace)

A Traefik `TLSStore` CRD named `default` in the `traefik` namespace. Traefik automatically uses the `default` TLSStore for all HTTPS connections, so no per-ingress TLS configuration is needed.

```yaml
apiVersion: traefik.io/v1alpha1
kind: TLSStore
metadata:
  name: default
  namespace: traefik
spec:
  defaultCertificate:
    secretName: traefik-default-tls
```

### 5. Traefik EC Extension Updates

Two changes to the Traefik extension values in `embedded-cluster-config.yaml`:

**HTTPS NodePort 443:**
```yaml
ports:
  websecure:
    port: 8443
    expose:
      default: true
    exposedPort: 443
    nodePort: 443
```

**HTTP → HTTPS redirect at the entrypoint level:**
```yaml
ports:
  web:
    redirections:
      entryPoint:
        to: websecure
        scheme: https
        permanent: true
```

### 6. App Ingress

No changes required. The Traefik `TLSStore` default handles TLS termination globally — the app's Ingress resource does not need a `tls:` block.

### 7. CI Pipeline

Add `helm pull cert-manager` to the `Package Helm chart` step in `.github/workflows/build-test.yml`, alongside the existing Traefik pull:

```bash
helm repo add jetstack https://charts.jetstack.io
helm pull jetstack/cert-manager --version v1.17.2 -d deploy/manifests
```

## CMX Port Expose

After upgrading, expose port 443 via CMX:

```bash
replicated vm port expose <vm-id> --port 443 --protocol https --token $REPLICATED_API_TOKEN
```

The app is then accessible at the HTTPS CMX URL. Browser will show a self-signed certificate warning (expected).

## Data Flow

```
Browser (HTTPS) → CMX proxy → NodePort 443 → Traefik websecure entrypoint
                                              → TLSStore default (traefik-default-tls secret)
                                              → Ingress routing by hostname
                                              → playball-exe service :3000

Browser (HTTP)  → CMX proxy → NodePort 80   → Traefik web entrypoint
                                              → 301 redirect to https://
```

## E2E CI Validation (`e2e-ec3.yml`)

Two changes to the existing e2e workflow:

**1. Add `hostname` to config-values.** The field is required. Use a fixed CI hostname — no real DNS needed since validation happens from inside the VM:

```yaml
hostname:
  value: "test.playball.example.com"
```

**2. Add a "Validate HTTPS" step** after install. SSH in and curl the NodePorts directly with an explicit `Host` header — no CMX port expose required:

```bash
# Assert HTTP redirects to HTTPS (301 or 308)
HTTP_STATUS=$(curl -so /dev/null -w "%{http_code}" \
  -H "Host: test.playball.example.com" http://10.0.0.11:80/)
[ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "308" ] || \
  { echo "Expected redirect, got $HTTP_STATUS"; exit 1; }

# Assert HTTPS serves the app (200)
HTTPS_STATUS=$(curl -sko /dev/null -w "%{http_code}" \
  -H "Host: test.playball.example.com" https://10.0.0.11:443/)
[ "$HTTPS_STATUS" = "200" ] || \
  { echo "Expected 200, got $HTTPS_STATUS"; exit 1; }
```

The `--insecure` flag (`-k`) is required since the cert is self-signed.

## Out of Scope

- ACME/Let's Encrypt (requires publicly resolvable DNS and port 80/443 challenge access)
- Certificate rotation alerting
- mTLS between services
