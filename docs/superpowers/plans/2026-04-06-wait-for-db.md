# Wait-for-DB Init Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `wait-for-db` init container that polls the database TCP port until it is reachable, preventing the `migrate` init container from crashlooping when the DB is not yet ready.

**Architecture:** Insert a new `wait-for-db` init container as the first init container in the Helm deployment template. It reuses the app image, reads `DATABASE_URL` from the existing secret, parses host/port with Node's `URL` class, and polls via TCP every 2 seconds until connected.

**Tech Stack:** Helm 3, Kubernetes init containers, Node.js `net` module (already in app image)

---

### Task 1: Add `wait-for-db` init container to deployment template

**Files:**
- Modify: `deploy/charts/templates/deployment.yaml`

- [ ] **Step 1: Verify current init container order with `helm template`**

Run from the repo root:
```bash
helm template test deploy/charts \
  --set nextauth.secret=testsecret \
  | grep -A5 'initContainers'
```

Expected output shows `migrate` as the first init container and `seed` second. Confirms baseline before change.

- [ ] **Step 2: Insert `wait-for-db` init container**

In `deploy/charts/templates/deployment.yaml`, replace the `initContainers:` block (currently starting at line 17) with the version below. The only change is prepending the new `wait-for-db` entry before `migrate`:

```yaml
      initContainers:
        - name: wait-for-db
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          command:
            - node
            - -e
            - |
              const net = require('net');
              const u = new URL(process.env.DATABASE_URL);
              const host = u.hostname, port = parseInt(u.port || '5432');
              (function check() {
                const s = net.createConnection(port, host);
                s.on('connect', () => { console.log('DB ready'); s.end(); });
                s.on('error', () => { console.log('Waiting for DB...'); setTimeout(check, 2000); });
              })();
          envFrom:
            - secretRef:
                name: {{ include "playball-exe.fullname" . }}
        - name: migrate
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          command:
            - node
            - node_modules/prisma/build/index.js
            - migrate
            - deploy
          envFrom:
            - secretRef:
                name: {{ include "playball-exe.fullname" . }}
        - name: seed
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          command:
            - node
            - prisma/seed.js
          envFrom:
            - secretRef:
                name: {{ include "playball-exe.fullname" . }}
```

- [ ] **Step 3: Verify rendered output shows correct init container order**

```bash
helm template test deploy/charts \
  --set nextauth.secret=testsecret \
  | grep -A2 'name: wait-for-db\|name: migrate\|name: seed'
```

Expected output (order matters):
```
        - name: wait-for-db
        ...
        - name: migrate
        ...
        - name: seed
```

- [ ] **Step 4: Verify `wait-for-db` has DATABASE_URL available**

```bash
helm template test deploy/charts \
  --set nextauth.secret=testsecret \
  | grep -A30 'name: wait-for-db'
```

Expected: the `wait-for-db` stanza includes an `envFrom` block referencing the secret, same as `migrate`.

- [ ] **Step 5: Verify helm lint passes**

```bash
helm lint deploy/charts --set nextauth.secret=testsecret
```

Expected:
```
==> Linting deploy/charts
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

- [ ] **Step 6: Commit**

```bash
git add deploy/charts/templates/deployment.yaml
git commit -m "feat: add wait-for-db init container to prevent crashloop on startup"
```
