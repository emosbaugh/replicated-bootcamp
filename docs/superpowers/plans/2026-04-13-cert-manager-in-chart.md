# cert-manager in Chart + Route 53 DNS-01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move cert-manager resources out of `deploy/manifests/` into the Helm chart and add Route 53 DNS-01 as a new TLS mode, all configurable via kots-config.yaml.

**Architecture:** Four raw manifest files are deleted and replaced by three Helm chart templates gated by a new `certManager` values block. KOTS config options in kots-config.yaml map to Helm values via a new `certManager` block in helmchart.yaml. Cross-namespace resources (`namespace: traefik`, `namespace: cert-manager`) are declared directly in chart templates.

**Tech Stack:** Helm 3, cert-manager v1, KOTS v1beta2 HelmChart, Traefik v3

**Branch:** `feat/cert-manager-in-chart`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `deploy/charts/values.yaml` | Add `certManager` block with defaults |
| Create | `deploy/charts/templates/cert-manager-issuer.yaml` | `selfsigned` + `letsencrypt` ClusterIssuers |
| Create | `deploy/charts/templates/cert-manager-resources.yaml` | `Certificate`, `TLSStore`, manual TLS `Secret` (namespace: traefik) |
| Create | `deploy/charts/templates/cert-manager-route53-secret.yaml` | Route 53 credentials `Secret` (namespace: cert-manager) |
| Modify | `deploy/manifests/kots-config.yaml` | Add `lets_encrypt_dns01` mode + Route 53 config items |
| Modify | `deploy/manifests/helmchart.yaml` | Map KOTS config options to `certManager` Helm values |
| Delete | `deploy/manifests/cert-manager-certificate.yaml` | Replaced by chart template |
| Delete | `deploy/manifests/cert-manager-issuer.yaml` | Replaced by chart template |
| Delete | `deploy/manifests/cert-manager-tls-secret.yaml` | Replaced by chart template |
| Delete | `deploy/manifests/cert-manager-tlsstore.yaml` | Replaced by chart template |

---

### Task 1: Add certManager values block

**Files:**
- Modify: `deploy/charts/values.yaml`

- [ ] **Step 1: Add the certManager block after the `nextauth` block**

```yaml
certManager:
  enabled: true
  # self_signed | lets_encrypt | lets_encrypt_dns01 | manual
  mode: self_signed
  acme:
    email: ""
    dns01:
      route53:
        hostedZoneId: ""
        accessKeyId: ""
        secretAccessKey: ""
  manual:
    cert: ""  # base64-encoded PEM certificate
    key: ""   # base64-encoded PEM private key
```

- [ ] **Step 2: Verify helm lint passes**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 3: Commit**

```bash
git add deploy/charts/values.yaml
git commit -m "feat: add certManager values block"
```

---

### Task 2: Create cert-manager-issuer.yaml template

**Files:**
- Create: `deploy/charts/templates/cert-manager-issuer.yaml`

- [ ] **Step 1: Create the file**

```yaml
{{- if .Values.certManager.enabled }}
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned
spec:
  selfSigned: {}
{{- if or (eq .Values.certManager.mode "lets_encrypt") (eq .Values.certManager.mode "lets_encrypt_dns01") }}
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: {{ .Values.certManager.acme.email | quote }}
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
      {{- if eq .Values.certManager.mode "lets_encrypt" }}
      - http01:
          ingress:
            ingressClassName: traefik
      {{- else }}
      - dns01:
          route53:
            region: us-east-1
            hostedZoneID: {{ .Values.certManager.acme.dns01.route53.hostedZoneId | quote }}
            accessKeyIDSecretRef:
              name: cert-manager-route53-credentials
              key: access-key-id
            secretAccessKeySecretRef:
              name: cert-manager-route53-credentials
              key: secret-access-key
      {{- end }}
{{- end }}
{{- end }}
```

- [ ] **Step 2: Verify self_signed renders only the selfsigned issuer**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=self_signed \
  | grep "kind: ClusterIssuer" | wc -l
```

Expected: `1`

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=self_signed \
  | grep "name: letsencrypt" | wc -l
```

Expected: `0`

- [ ] **Step 3: Verify lets_encrypt renders letsencrypt issuer with HTTP-01**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=lets_encrypt \
  --set certManager.acme.email=admin@example.com \
  | grep -E "ingressClassName|route53"
```

Expected: `ingressClassName: traefik` present. `route53` absent.

- [ ] **Step 4: Verify lets_encrypt_dns01 renders letsencrypt issuer with Route 53 solver**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=lets_encrypt_dns01 \
  --set certManager.acme.email=admin@example.com \
  --set certManager.acme.dns01.route53.hostedZoneId=Z0123456789ABC \
  --set certManager.acme.dns01.route53.accessKeyId=AKIAIOSFODNN7EXAMPLE \
  --set certManager.acme.dns01.route53.secretAccessKey=wJalrXUtnFEMI \
  | grep -E "route53:|hostedZoneID:"
```

Expected: both lines present.

- [ ] **Step 5: Verify certManager.enabled=false renders no ClusterIssuers**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.enabled=false \
  | grep "kind: ClusterIssuer" | wc -l
```

Expected: `0`

- [ ] **Step 6: Lint**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 7: Commit**

```bash
git add deploy/charts/templates/cert-manager-issuer.yaml
git commit -m "feat: add ClusterIssuer chart templates for self-signed and Let's Encrypt"
```

---

### Task 3: Create cert-manager-resources.yaml template

**Files:**
- Create: `deploy/charts/templates/cert-manager-resources.yaml`

- [ ] **Step 1: Create the file**

```yaml
{{- if .Values.certManager.enabled }}
{{- if ne .Values.certManager.mode "manual" }}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: traefik-default-tls
  namespace: traefik
spec:
  secretName: traefik-default-tls
  dnsNames:
    - {{ default "cluster.local" .Values.ingress.hostname | quote }}
  issuerRef:
    name: {{ if or (eq .Values.certManager.mode "lets_encrypt") (eq .Values.certManager.mode "lets_encrypt_dns01") }}letsencrypt{{ else }}selfsigned{{ end }}
    kind: ClusterIssuer
{{- end }}
---
apiVersion: traefik.io/v1alpha1
kind: TLSStore
metadata:
  name: default
  namespace: traefik
spec:
  defaultCertificate:
    secretName: traefik-default-tls
{{- if eq .Values.certManager.mode "manual" }}
---
apiVersion: v1
kind: Secret
metadata:
  name: traefik-default-tls
  namespace: traefik
type: kubernetes.io/tls
data:
  tls.crt: {{ .Values.certManager.manual.cert | quote }}
  tls.key: {{ .Values.certManager.manual.key | quote }}
{{- end }}
{{- end }}
```

- [ ] **Step 2: Verify self_signed renders Certificate (referencing selfsigned) and TLSStore**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=self_signed \
  | grep -E "kind: Certificate|kind: TLSStore|name: selfsigned"
```

Expected: `kind: Certificate`, `kind: TLSStore`, `name: selfsigned` all present.

- [ ] **Step 3: Verify lets_encrypt_dns01 Certificate references letsencrypt issuer**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=lets_encrypt_dns01 \
  --set certManager.acme.email=admin@example.com \
  --set certManager.acme.dns01.route53.hostedZoneId=Z0123456789ABC \
  --set certManager.acme.dns01.route53.accessKeyId=AKIAIOSFODNN7EXAMPLE \
  --set certManager.acme.dns01.route53.secretAccessKey=wJalrXUtnFEMI \
  | grep -A5 "kind: Certificate"
```

Expected: issuerRef contains `name: letsencrypt`.

- [ ] **Step 4: Verify manual mode renders TLSStore and TLS Secret, no Certificate**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=manual \
  --set certManager.manual.cert=dGVzdA== \
  --set certManager.manual.key=dGVzdA== \
  | grep -E "kind: Certificate|kind: TLSStore|kubernetes.io/tls"
```

Expected: `kind: TLSStore` and `kubernetes.io/tls` present. `kind: Certificate` absent.

- [ ] **Step 5: Verify certManager.enabled=false renders nothing**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.enabled=false \
  | grep -E "kind: Certificate|kind: TLSStore" | wc -l
```

Expected: `0`

- [ ] **Step 6: Lint**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 7: Commit**

```bash
git add deploy/charts/templates/cert-manager-resources.yaml
git commit -m "feat: add Certificate, TLSStore, and manual TLS Secret chart templates"
```

---

### Task 4: Create cert-manager-route53-secret.yaml template

**Files:**
- Create: `deploy/charts/templates/cert-manager-route53-secret.yaml`

- [ ] **Step 1: Create the file**

```yaml
{{- if and .Values.certManager.enabled (eq .Values.certManager.mode "lets_encrypt_dns01") }}
apiVersion: v1
kind: Secret
metadata:
  name: cert-manager-route53-credentials
  namespace: cert-manager
type: Opaque
stringData:
  access-key-id: {{ .Values.certManager.acme.dns01.route53.accessKeyId | quote }}
  secret-access-key: {{ .Values.certManager.acme.dns01.route53.secretAccessKey | quote }}
{{- end }}
```

- [ ] **Step 2: Verify lets_encrypt_dns01 renders the credentials Secret in cert-manager namespace**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=lets_encrypt_dns01 \
  --set certManager.acme.email=admin@example.com \
  --set certManager.acme.dns01.route53.hostedZoneId=Z0123456789ABC \
  --set certManager.acme.dns01.route53.accessKeyId=AKIAIOSFODNN7EXAMPLE \
  --set certManager.acme.dns01.route53.secretAccessKey=wJalrXUtnFEMI \
  | grep -A3 "name: cert-manager-route53-credentials"
```

Expected: contains `namespace: cert-manager`.

- [ ] **Step 3: Verify other modes do NOT render the credentials Secret**

```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=lets_encrypt \
  --set certManager.acme.email=admin@example.com \
  | grep "cert-manager-route53-credentials" | wc -l
```

Expected: `0`

- [ ] **Step 4: Lint**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 5: Commit**

```bash
git add deploy/charts/templates/cert-manager-route53-secret.yaml
git commit -m "feat: add Route 53 credentials Secret chart template"
```

---

### Task 5: Update kots-config.yaml

**Files:**
- Modify: `deploy/manifests/kots-config.yaml`

- [ ] **Step 1: Add lets_encrypt_dns01 to tls_mode and rename lets_encrypt label**

Find the `tls_mode` item's `items` list. Currently:

```yaml
          items:
            - name: self_signed
              title: Automatic - Self-Signed
            - name: lets_encrypt
              title: Automatic - Let's Encrypt
            - name: manual
              title: Manual Upload
```

Replace with:

```yaml
          items:
            - name: self_signed
              title: Automatic - Self-Signed
            - name: lets_encrypt
              title: Automatic - Let's Encrypt (HTTP-01)
            - name: lets_encrypt_dns01
              title: Automatic - Let's Encrypt (DNS-01 / Route 53)
            - name: manual
              title: Manual Upload
```

- [ ] **Step 2: Update acme_email when condition**

Find:

```yaml
          when: '{{repl ConfigOptionEquals "tls_mode" "lets_encrypt"}}'
```

Replace with:

```yaml
          when: '{{repl or (ConfigOptionEquals "tls_mode" "lets_encrypt") (ConfigOptionEquals "tls_mode" "lets_encrypt_dns01")}}'
```

- [ ] **Step 3: Add Route 53 config items after acme_email**

After the closing of the `acme_email` item and before `tls_cert`, add:

```yaml
        - name: route53_hosted_zone_id
          title: Route 53 Hosted Zone ID
          help_text: "The Route 53 Hosted Zone ID for your domain (e.g. Z0123456789ABC). Found in the Route 53 console under Hosted zones."
          type: text
          when: '{{repl ConfigOptionEquals "tls_mode" "lets_encrypt_dns01"}}'
          required: true
        - name: route53_access_key_id
          title: AWS Access Key ID
          help_text: "IAM access key ID. The IAM user needs route53:ChangeResourceRecordSets, route53:ListResourceRecordSets, and route53:GetChange permissions on the hosted zone."
          type: text
          when: '{{repl ConfigOptionEquals "tls_mode" "lets_encrypt_dns01"}}'
          required: true
        - name: route53_secret_access_key
          title: AWS Secret Access Key
          help_text: "IAM secret access key corresponding to the access key ID above."
          type: password
          when: '{{repl ConfigOptionEquals "tls_mode" "lets_encrypt_dns01"}}'
          required: true
```

- [ ] **Step 4: Commit**

```bash
git add deploy/manifests/kots-config.yaml
git commit -m "feat: add lets_encrypt_dns01 tls mode and Route 53 config items"
```

---

### Task 6: Update helmchart.yaml

**Files:**
- Modify: `deploy/manifests/helmchart.yaml`

- [ ] **Step 1: Add certManager block to spec.values**

After the `aiCommentary` block in `spec.values`, add:

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

- [ ] **Step 2: Lint**

```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 3: Commit**

```bash
git add deploy/manifests/helmchart.yaml
git commit -m "feat: map KOTS config options to certManager chart values"
```

---

### Task 7: Delete old manifest files and final verification

**Files:**
- Delete: `deploy/manifests/cert-manager-certificate.yaml`
- Delete: `deploy/manifests/cert-manager-issuer.yaml`
- Delete: `deploy/manifests/cert-manager-tls-secret.yaml`
- Delete: `deploy/manifests/cert-manager-tlsstore.yaml`

- [ ] **Step 1: Delete the four manifest files**

```bash
git rm deploy/manifests/cert-manager-certificate.yaml \
       deploy/manifests/cert-manager-issuer.yaml \
       deploy/manifests/cert-manager-tls-secret.yaml \
       deploy/manifests/cert-manager-tlsstore.yaml
```

- [ ] **Step 2: Verify only kots.io kinds remain in deploy/manifests/**

```bash
ls deploy/manifests/
```

Expected:
```
embedded-cluster-config.yaml
helmchart.yaml
kots-app.yaml
kots-config.yaml
```

- [ ] **Step 3: Full smoke test — all four TLS modes**

Self-signed (default):
```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  | grep -E "name: selfsigned|name: letsencrypt|kind: Certificate|kind: TLSStore"
```
Expected: `name: selfsigned`, `kind: Certificate`, `kind: TLSStore`. `name: letsencrypt` absent.

Let's Encrypt HTTP-01:
```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=lets_encrypt \
  --set certManager.acme.email=admin@example.com \
  | grep -E "ingressClassName|route53"
```
Expected: `ingressClassName: traefik` present. `route53` absent.

Let's Encrypt DNS-01:
```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=lets_encrypt_dns01 \
  --set certManager.acme.email=admin@example.com \
  --set certManager.acme.dns01.route53.hostedZoneId=Z0123456789ABC \
  --set certManager.acme.dns01.route53.accessKeyId=AKIAIOSFODNN7EXAMPLE \
  --set certManager.acme.dns01.route53.secretAccessKey=wJalrXUtnFEMI \
  | grep -E "route53:|hostedZoneID:|cert-manager-route53-credentials"
```
Expected: all three lines present.

Manual:
```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.mode=manual \
  --set certManager.manual.cert=dGVzdA== \
  --set certManager.manual.key=dGVzdA== \
  | grep -E "kubernetes.io/tls|kind: Certificate"
```
Expected: `kubernetes.io/tls` present. `kind: Certificate` absent.

Disabled:
```bash
helm template playball-exe deploy/charts --set nextauth.secret=test \
  --set certManager.enabled=false \
  | grep -E "ClusterIssuer|Certificate|TLSStore|route53" | wc -l
```
Expected: `0`

- [ ] **Step 4: Run pre-push checks**

```bash
npm test
docker build -f deploy/Dockerfile .
helm lint deploy/charts --set nextauth.secret=test
```

All must pass before continuing.

- [ ] **Step 5: Commit deletion**

```bash
git commit -m "feat: remove cert-manager raw manifests, resources now in Helm chart"
```
