# HTTPS / TLS Helm Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured HTTPS/TLS support to the playball-exe Helm chart with three modes: auto-provisioned (cert-manager), manually provided, and self-signed (cert-manager SelfSigned issuer).

**Architecture:** A top-level `tls` block replaces the existing bare `ingress.tls` array. A `mode` discriminator (`auto` | `manual` | `self-signed`) controls which Kubernetes resources the chart renders. cert-manager is an optional subchart dependency enabled via `certmanager.enabled`.

**Tech Stack:** Helm 3, cert-manager v1.20.1, Kubernetes `networking.k8s.io/v1` Ingress, `cert-manager.io/v1` Certificate + Issuer CRDs.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `deploy/charts/Chart.yaml` | Modify | Add cert-manager subchart dependency |
| `deploy/charts/Chart.lock` | Regenerate | Updated by `helm dependency update` |
| `deploy/charts/values.yaml` | Modify | Replace `ingress.tls` array with structured `tls` block; add `certmanager` block |
| `deploy/charts/values.schema.json` | Modify | Schema for new `tls` + `certmanager` blocks; remove `ingress.tls` |
| `deploy/charts/templates/_helpers.tpl` | Modify | Add `playball-exe.tlsSecretName` + `playball-exe.validateTls` helpers |
| `deploy/charts/templates/ingress.yaml` | Modify | cert-manager annotations; new TLS stanza using helper |
| `deploy/charts/templates/tls-secret.yaml` | Create | `kubernetes.io/tls` Secret for `mode=manual` with inline cert/key |
| `deploy/charts/templates/issuer.yaml` | Create | SelfSigned cert-manager `Issuer` for `mode=self-signed` |
| `deploy/charts/templates/certificate.yaml` | Create | cert-manager `Certificate` for `mode=self-signed` |

---

## Task 1: Add cert-manager subchart to Chart.yaml

**Files:**
- Modify: `deploy/charts/Chart.yaml`

- [ ] **Step 1: Add cert-manager dependency**

Replace the entire contents of `deploy/charts/Chart.yaml` with:

```yaml
apiVersion: v2
name: playball-exe
description: Helm chart for deploying the playball.exe baseball game
type: application
version: 0.1.0
appVersion: "latest"
dependencies:
  - name: postgresql
    version: "18.5.15"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: postgresql.enabled
  - name: cert-manager
    version: "v1.20.1"
    repository: https://charts.jetstack.io
    condition: certmanager.enabled
```

- [ ] **Step 2: Update Chart.lock**

```bash
helm dependency update deploy/charts
```

Expected: output ends with `...Successfully got an update from the "jetstack" chart repository` and `deploy/charts/Chart.lock` is updated with a new entry for cert-manager.

- [ ] **Step 3: Commit**

```bash
git add deploy/charts/Chart.yaml deploy/charts/Chart.lock
git commit -m "feat: add cert-manager as optional subchart dependency"
```

---

## Task 2: Update values.yaml

**Files:**
- Modify: `deploy/charts/values.yaml`

- [ ] **Step 1: Replace values.yaml**

Replace the entire file with:

```yaml
# Container image for the app (and migration init container)
image:
  repository: docker.io/replemos/playball.exe
  tag: main
  pullPolicy: Always

replicaCount: 1

service:
  # ClusterIP | LoadBalancer | NodePort
  type: ClusterIP
  port: 3000

ingress:
  enabled: false
  className: ""
  hostname: ""

tls:
  enabled: false
  # mode: auto | manual | self-signed
  mode: auto

  auto:
    issuerRef:
      name: ""             # required when mode=auto (e.g. letsencrypt-prod)
      kind: ClusterIssuer  # ClusterIssuer | Issuer

  manual:
    # Option 1: reference a pre-existing kubernetes.io/tls Secret
    secretName: ""
    # Option 2: provide cert and key PEM directly (mutually exclusive with secretName)
    cert: ""
    key: ""

# NOTE: when tls.enabled=true, update nextauth.url to https://<hostname>

# Set postgresql.enabled=false and provide externalDatabase.url to use your own PostgreSQL
postgresql:
  enabled: true
  auth:
    database: baseball
    username: baseball
    # Override this in production!
    password: baseball
  primary:
    persistence:
      size: 1Gi

# Only used when postgresql.enabled=false
externalDatabase:
  url: ""

nextauth:
  # Required: generate with: openssl rand -base64 32
  secret: ""
  url: "http://localhost:3000"

certmanager:
  enabled: false
  installCRDs: true
```

- [ ] **Step 2: Commit**

```bash
git add deploy/charts/values.yaml
git commit -m "feat: add structured tls + certmanager values block"
```

---

## Task 3: Update values.schema.json

**Files:**
- Modify: `deploy/charts/values.schema.json`

- [ ] **Step 1: Replace values.schema.json**

Replace the entire file with:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "playball-exe values",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "image": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "repository": { "type": "string" },
        "tag": { "type": "string" },
        "pullPolicy": {
          "type": "string",
          "enum": ["Always", "IfNotPresent", "Never"]
        }
      }
    },
    "replicaCount": {
      "type": "integer",
      "minimum": 1
    },
    "service": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": ["ClusterIP", "LoadBalancer", "NodePort"]
        },
        "port": {
          "type": "integer",
          "minimum": 1,
          "maximum": 65535
        }
      }
    },
    "ingress": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "className": { "type": "string" },
        "hostname": { "type": "string" }
      },
      "if": {
        "properties": { "enabled": { "const": true } },
        "required": ["enabled"]
      },
      "then": {
        "properties": {
          "hostname": { "type": "string", "minLength": 1 }
        },
        "required": ["hostname"]
      }
    },
    "tls": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "mode": {
          "type": "string",
          "enum": ["auto", "manual", "self-signed"]
        },
        "auto": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "issuerRef": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "name": { "type": "string" },
                "kind": {
                  "type": "string",
                  "enum": ["ClusterIssuer", "Issuer"]
                }
              }
            }
          }
        },
        "manual": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "secretName": { "type": "string" },
            "cert": { "type": "string" },
            "key": { "type": "string" }
          }
        }
      },
      "if": {
        "properties": {
          "enabled": { "const": true },
          "mode": { "const": "auto" }
        },
        "required": ["enabled", "mode"]
      },
      "then": {
        "properties": {
          "auto": {
            "properties": {
              "issuerRef": {
                "properties": {
                  "name": { "type": "string", "minLength": 1 }
                },
                "required": ["name"]
              }
            },
            "required": ["issuerRef"]
          }
        },
        "required": ["auto"]
      }
    },
    "postgresql": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "auth": {
          "type": "object",
          "properties": {
            "database": { "type": "string" },
            "username": { "type": "string" },
            "password": { "type": "string" }
          }
        },
        "primary": {
          "type": "object",
          "properties": {
            "persistence": {
              "type": "object",
              "properties": {
                "size": {
                  "type": "string",
                  "pattern": "^[0-9]+(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?$"
                }
              }
            }
          }
        }
      }
    },
    "externalDatabase": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "url": { "type": "string" }
      }
    },
    "nextauth": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "secret": { "type": "string" },
        "url": { "type": "string", "format": "uri" }
      },
      "required": ["secret", "url"]
    },
    "certmanager": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "enabled": { "type": "boolean" },
        "installCRDs": { "type": "boolean" }
      }
    }
  },
  "if": {
    "properties": {
      "postgresql": {
        "properties": { "enabled": { "const": false } },
        "required": ["enabled"]
      }
    }
  },
  "then": {
    "properties": {
      "externalDatabase": {
        "properties": {
          "url": { "type": "string", "minLength": 1 }
        },
        "required": ["url"]
      }
    },
    "required": ["externalDatabase"]
  }
}
```

- [ ] **Step 2: Verify lint passes**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 3: Commit**

```bash
git add deploy/charts/values.schema.json
git commit -m "feat: update schema — add tls/certmanager blocks, remove ingress.tls array"
```

---

## Task 4: Add helpers to _helpers.tpl

**Files:**
- Modify: `deploy/charts/templates/_helpers.tpl`

- [ ] **Step 1: Append helpers**

Append the following to the end of `deploy/charts/templates/_helpers.tpl`:

```
{{/*
TLS secret name resolution.
- mode=auto or self-signed: <fullname>-tls (cert-manager creates it)
- mode=manual with secretName: the provided secret name
- mode=manual with cert/key: <fullname>-tls (tls-secret.yaml creates it)
*/}}
{{- define "playball-exe.tlsSecretName" -}}
{{- if and (eq .Values.tls.mode "manual") .Values.tls.manual.secretName -}}
{{- .Values.tls.manual.secretName }}
{{- else -}}
{{- printf "%s-tls" (include "playball-exe.fullname" .) }}
{{- end -}}
{{- end }}

{{/*
TLS validation — call from every template that renders TLS resources.
Fails with a descriptive message on misconfiguration.
*/}}
{{- define "playball-exe.validateTls" -}}
{{- if .Values.tls.enabled -}}
{{- if eq .Values.tls.mode "auto" -}}
{{- if not .Values.tls.auto.issuerRef.name -}}
{{- fail "tls.auto.issuerRef.name is required when tls.mode=auto" -}}
{{- end -}}
{{- else if eq .Values.tls.mode "manual" -}}
{{- if and (not .Values.tls.manual.secretName) (not .Values.tls.manual.cert) -}}
{{- fail "tls.mode=manual requires either tls.manual.secretName or tls.manual.cert (not both)" -}}
{{- end -}}
{{- if and .Values.tls.manual.secretName .Values.tls.manual.cert -}}
{{- fail "tls.manual.secretName and tls.manual.cert are mutually exclusive — use one or the other" -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
```

- [ ] **Step 2: Verify lint still passes**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 3: Commit**

```bash
git add deploy/charts/templates/_helpers.tpl
git commit -m "feat: add tlsSecretName and validateTls helpers"
```

---

## Task 5: Update ingress.yaml

**Files:**
- Modify: `deploy/charts/templates/ingress.yaml`

- [ ] **Step 1: Replace ingress.yaml**

Replace the entire file with:

```yaml
{{- include "playball-exe.validateTls" . -}}
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "playball-exe.fullname" . }}
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
  {{- if and .Values.tls.enabled (eq .Values.tls.mode "auto") }}
  annotations:
    {{- if eq .Values.tls.auto.issuerRef.kind "ClusterIssuer" }}
    cert-manager.io/cluster-issuer: {{ .Values.tls.auto.issuerRef.name | quote }}
    {{- else }}
    cert-manager.io/issuer: {{ .Values.tls.auto.issuerRef.name | quote }}
    {{- end }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.tls.enabled }}
  tls:
    - secretName: {{ include "playball-exe.tlsSecretName" . | quote }}
      hosts:
        - {{ required "ingress.hostname is required when ingress.enabled=true" .Values.ingress.hostname | quote }}
  {{- end }}
  rules:
    - host: {{ required "ingress.hostname is required when ingress.enabled=true" .Values.ingress.hostname | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "playball-exe.fullname" . }}
                port:
                  number: {{ .Values.service.port }}
{{- end }}
```

- [ ] **Step 2: Smoke test — mode=auto**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=auto \
  --set tls.auto.issuerRef.name=letsencrypt-prod \
  --set tls.auto.issuerRef.kind=ClusterIssuer \
  | grep -A 20 "kind: Ingress"
```

Expected output includes:
```yaml
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
```
and:
```yaml
  tls:
    - secretName: "test-tls"
      hosts:
        - "playball.example.com"
```

- [ ] **Step 3: Smoke test — mode=manual with secretName**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=manual \
  --set tls.manual.secretName=my-tls-secret \
  | grep -A 10 "kind: Ingress" | grep secretName
```

Expected: `secretName: "my-tls-secret"`

- [ ] **Step 4: Smoke test — fail guard (auto with empty issuerRef.name)**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=auto \
  2>&1 | grep "tls.auto.issuerRef.name is required"
```

Expected: line containing `tls.auto.issuerRef.name is required when tls.mode=auto`

- [ ] **Step 5: Commit**

```bash
git add deploy/charts/templates/ingress.yaml
git commit -m "feat: update ingress for structured TLS modes and cert-manager annotations"
```

---

## Task 6: Create tls-secret.yaml

**Files:**
- Create: `deploy/charts/templates/tls-secret.yaml`

- [ ] **Step 1: Create tls-secret.yaml**

Create `deploy/charts/templates/tls-secret.yaml` with:

```yaml
{{- include "playball-exe.validateTls" . -}}
{{- if and .Values.tls.enabled (eq .Values.tls.mode "manual") .Values.tls.manual.cert }}
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "playball-exe.fullname" . }}-tls
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
type: kubernetes.io/tls
data:
  tls.crt: {{ .Values.tls.manual.cert | b64enc | quote }}
  tls.key: {{ .Values.tls.manual.key | b64enc | quote }}
{{- end }}
```

- [ ] **Step 2: Smoke test — mode=manual with cert/key**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=manual \
  --set tls.manual.cert="fakecert" \
  --set tls.manual.key="fakekey" \
  | grep -A 8 "kind: Secret" | grep -E "name:|type:|tls.crt|tls.key"
```

Expected output includes a `kubernetes.io/tls` Secret named `test-tls` with `tls.crt` and `tls.key` base64-encoded.

- [ ] **Step 3: Smoke test — fail guard (both secretName and cert set)**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=manual \
  --set tls.manual.secretName=my-secret \
  --set tls.manual.cert="fakecert" \
  2>&1 | grep "mutually exclusive"
```

Expected: line containing `tls.manual.secretName and tls.manual.cert are mutually exclusive`

- [ ] **Step 4: Commit**

```bash
git add deploy/charts/templates/tls-secret.yaml
git commit -m "feat: add tls-secret.yaml for manual cert/key mode"
```

---

## Task 7: Create issuer.yaml and certificate.yaml

**Files:**
- Create: `deploy/charts/templates/issuer.yaml`
- Create: `deploy/charts/templates/certificate.yaml`

- [ ] **Step 1: Create issuer.yaml**

Create `deploy/charts/templates/issuer.yaml` with:

```yaml
{{- include "playball-exe.validateTls" . -}}
{{- if and .Values.tls.enabled (eq .Values.tls.mode "self-signed") }}
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: {{ include "playball-exe.fullname" . }}-selfsigned
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
spec:
  selfSigned: {}
{{- end }}
```

- [ ] **Step 2: Create certificate.yaml**

Create `deploy/charts/templates/certificate.yaml` with:

```yaml
{{- include "playball-exe.validateTls" . -}}
{{- if and .Values.tls.enabled (eq .Values.tls.mode "self-signed") }}
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: {{ include "playball-exe.fullname" . }}-tls
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
spec:
  secretName: {{ include "playball-exe.fullname" . }}-tls
  issuerRef:
    name: {{ include "playball-exe.fullname" . }}-selfsigned
    kind: Issuer
  dnsNames:
    - {{ required "ingress.hostname is required when tls.mode=self-signed" .Values.ingress.hostname | quote }}
{{- end }}
```

- [ ] **Step 3: Smoke test — mode=self-signed**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=self-signed
```

Expected: output contains all of:
- `kind: Issuer` with `selfSigned: {}`
- `kind: Certificate` with `secretName: test-tls` and `dnsNames: ["playball.example.com"]`
- `kind: Ingress` with `tls[0].secretName: "test-tls"` and no cert-manager annotations

- [ ] **Step 4: Commit**

```bash
git add deploy/charts/templates/issuer.yaml deploy/charts/templates/certificate.yaml
git commit -m "feat: add issuer.yaml and certificate.yaml for self-signed TLS mode"
```

---

## Task 8: Final lint and full smoke test

- [ ] **Step 1: Lint with all defaults**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 2: Lint with tls disabled (regression check — no TLS resources rendered)**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  | grep "kind:" | grep -E "Certificate|Issuer"
```

Expected: no output (Certificate and Issuer resources must NOT appear when `tls.enabled=false`)

- [ ] **Step 3: Full mode=auto render — no Certificate/Issuer resources**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=auto \
  --set tls.auto.issuerRef.name=letsencrypt-prod \
  | grep "kind:" | grep -E "Certificate|Issuer"
```

Expected: no output (cert-manager manages the cert via Ingress annotation; no Certificate or Issuer resources rendered)

- [ ] **Step 4: Full mode=self-signed render**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=self-signed \
  | grep "kind:"
```

Expected: output includes `kind: Issuer` and `kind: Certificate`

- [ ] **Step 5: Fail guard — mode=manual with nothing set**

```bash
helm template test deploy/charts \
  --set nextauth.secret=test \
  --set ingress.enabled=true \
  --set ingress.hostname=playball.example.com \
  --set tls.enabled=true \
  --set tls.mode=manual \
  2>&1 | grep "requires either"
```

Expected: line containing `tls.mode=manual requires either tls.manual.secretName or tls.manual.cert`

---

## Task 9: Create PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 2: Create PR**

```bash
gh pr create \
  --title "feat: HTTPS/TLS support for Helm chart (auto, manual, self-signed)" \
  --body "$(cat <<'EOF'
## Summary

- Adds structured `tls` block to `values.yaml` with a `mode` discriminator (`auto` | `manual` | `self-signed`)
- `auto`: cert-manager annotation on Ingress pointing to a user-specified ClusterIssuer/Issuer
- `manual`: reference a pre-existing TLS Secret by name, or provide cert/key PEM inline (chart creates the Secret)
- `self-signed`: cert-manager `Issuer` (SelfSigned) + `Certificate` resource rendered by chart
- `certmanager.enabled` installs cert-manager v1.20.1 as an optional subchart dependency
- Removes the old bare `ingress.tls: []` array
- Schema validation and template-level `fail` guards for all misconfiguration cases

## Test plan

- [ ] `helm lint deploy/charts --set nextauth.secret=test` passes
- [ ] `helm template` smoke tests pass for all three modes (see plan Task 8)
- [ ] Fail guards fire for: missing issuerRef.name (auto), neither/both secretName+cert (manual)
- [ ] CI E2E passes (no TLS — existing default path)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
