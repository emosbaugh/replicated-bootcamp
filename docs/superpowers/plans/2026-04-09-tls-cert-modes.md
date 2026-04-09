# TLS Certificate Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the HTTPS setup to let operators choose between self-signed (current default), Let's Encrypt (ACME), or a manually uploaded certificate.

**Architecture:** All changes are in KOTS manifest YAML files under `deploy/manifests/`. A new `tls_mode` select item in `kots-config.yaml` drives conditional inclusion of cert-manager resources via `kots.io/exclude` annotations and inline `repl{{...}}` templating. All three modes produce a Secret named `traefik-default-tls` in the `traefik` namespace, which the existing TLSStore already references — no Helm chart changes needed.

**Tech Stack:** KOTS config (kots.io/v1beta1), cert-manager (cert-manager.io/v1), Traefik TLSStore (traefik.io/v1alpha1), KOTS template functions (`ConfigOption`, `ConfigOptionEquals`)

---

## File Map

| File | Action |
|---|---|
| `deploy/manifests/kots-config.yaml` | Modify — add `tls_mode`, `acme_email`, `tls_cert`, `tls_key` items; update `hostname` help_text |
| `deploy/manifests/cert-manager-issuer.yaml` | Modify — add `letsencrypt` ClusterIssuer with `kots.io/exclude` annotation |
| `deploy/manifests/cert-manager-certificate.yaml` | Modify — add `kots.io/exclude` annotation; template `issuerRef.name` |
| `deploy/manifests/cert-manager-tls-secret.yaml` | Create — kubernetes.io/tls Secret from uploaded PEM files, excluded unless `tls_mode == manual` |

`cert-manager-tlsstore.yaml`, `helmchart.yaml`, `values.yaml`, and `values.schema.json` are **not touched**.

---

### Task 1: Add TLS mode config items to kots-config.yaml

**Files:**
- Modify: `deploy/manifests/kots-config.yaml`

- [ ] **Step 1: Replace the entire `ingress` group in kots-config.yaml**

The current ingress group has only `hostname`. Replace it with this full group (adds `tls_mode`, `acme_email`, `tls_cert`, `tls_key` and updates `hostname` help_text):

```yaml
    - name: ingress
      title: Ingress
      items:
        - name: hostname
          title: Hostname
          help_text: "Hostname for the app, e.g. playball.example.com. Required when using Let's Encrypt. Leave blank to accept traffic on any hostname."
          type: text
        - name: tls_mode
          title: TLS Certificate Mode
          type: select_one
          default: self_signed
          items:
            - name: self_signed
              title: Automatic - Self-Signed
            - name: lets_encrypt
              title: Automatic - Let's Encrypt
            - name: manual
              title: Manual Upload
        - name: acme_email
          title: Let's Encrypt Email
          type: text
          help_text: "Email address for Let's Encrypt registration and renewal notifications"
          when: '{{repl ConfigOptionEquals "tls_mode" "lets_encrypt"}}'
        - name: tls_cert
          title: TLS Certificate (PEM)
          type: file
          help_text: "PEM-encoded TLS certificate"
          when: '{{repl ConfigOptionEquals "tls_mode" "manual"}}'
        - name: tls_key
          title: TLS Private Key (PEM)
          type: file
          help_text: "PEM-encoded TLS private key"
          when: '{{repl ConfigOptionEquals "tls_mode" "manual"}}'
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml; list(yaml.safe_load_all(open('deploy/manifests/kots-config.yaml')))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Run npm test**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add deploy/manifests/kots-config.yaml
git commit -m "feat: add tls_mode, acme_email, tls_cert, tls_key config items"
```

---

### Task 2: Add Let's Encrypt ClusterIssuer to cert-manager-issuer.yaml

**Files:**
- Modify: `deploy/manifests/cert-manager-issuer.yaml`

- [ ] **Step 1: Replace the entire file with the updated content**

The existing file has only the `selfsigned` ClusterIssuer. Add the `letsencrypt` ClusterIssuer as a second document in the same file:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned
spec:
  selfSigned: {}
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
  annotations:
    kots.io/exclude: 'repl{{ not (ConfigOptionEquals "tls_mode" "lets_encrypt") }}'
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: 'repl{{ ConfigOption "acme_email" }}'
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
      - http01:
          ingress:
            class: traefik
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml; list(yaml.safe_load_all(open('deploy/manifests/cert-manager-issuer.yaml')))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Run npm test**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add deploy/manifests/cert-manager-issuer.yaml
git commit -m "feat: add Let's Encrypt ClusterIssuer"
```

---

### Task 3: Update Certificate to support all three modes

**Files:**
- Modify: `deploy/manifests/cert-manager-certificate.yaml`

- [ ] **Step 1: Replace the entire file with the updated content**

Add a `kots.io/exclude` annotation (skips the resource in manual mode) and template `issuerRef.name` to select the correct issuer:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: traefik-default-tls
  namespace: traefik
  annotations:
    kots.io/exclude: 'repl{{ ConfigOptionEquals "tls_mode" "manual" }}'
spec:
  secretName: traefik-default-tls
  dnsNames:
    - 'repl{{ or (ConfigOption "hostname") "cluster.local" }}'
  issuerRef:
    name: 'repl{{ if ConfigOptionEquals "tls_mode" "lets_encrypt" }}letsencrypt{{ else }}selfsigned{{ end }}'
    kind: ClusterIssuer
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml; list(yaml.safe_load_all(open('deploy/manifests/cert-manager-certificate.yaml')))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Run npm test**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add deploy/manifests/cert-manager-certificate.yaml
git commit -m "feat: conditionally exclude Certificate in manual mode, template issuerRef"
```

---

### Task 4: Create manual TLS Secret manifest

**Files:**
- Create: `deploy/manifests/cert-manager-tls-secret.yaml`

- [ ] **Step 1: Create the new file**

This Secret is only applied when `tls_mode == manual`. It writes the uploaded PEM cert and key into the `traefik-default-tls` Secret that the TLSStore already references:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: traefik-default-tls
  namespace: traefik
  annotations:
    kots.io/exclude: 'repl{{ not (ConfigOptionEquals "tls_mode" "manual") }}'
type: kubernetes.io/tls
data:
  tls.crt: 'repl{{ ConfigOption "tls_cert" }}'
  tls.key: 'repl{{ ConfigOption "tls_key" }}'
```

Note: `ConfigOption` for a `type: file` config item returns the base64-encoded file content, which is the correct encoding for a Secret `data` field.

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml; list(yaml.safe_load_all(open('deploy/manifests/cert-manager-tls-secret.yaml')))" && echo OK
```

Expected: `OK`

- [ ] **Step 3: Run npm test**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add deploy/manifests/cert-manager-tls-secret.yaml
git commit -m "feat: add manual TLS Secret manifest for cert upload mode"
```

---

### Task 5: Final validation

- [ ] **Step 1: Run the full pre-push checks**

```bash
docker build -f deploy/Dockerfile .
helm lint deploy/charts --set nextauth.secret=test
```

Expected: Docker build succeeds, helm lint prints `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 2: Verify all four manifest files are syntactically valid together**

```bash
for f in deploy/manifests/kots-config.yaml deploy/manifests/cert-manager-issuer.yaml deploy/manifests/cert-manager-certificate.yaml deploy/manifests/cert-manager-tls-secret.yaml; do
  python3 -c "import yaml; list(yaml.safe_load_all(open('$f')))" && echo "$f OK"
done
```

Expected: four `OK` lines

- [ ] **Step 3: Push**

```bash
git push
```
