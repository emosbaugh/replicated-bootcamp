# Support Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Replicated support bundle spec to the Helm chart and collect a support bundle as a CI artifact in the e2e workflow.

**Architecture:** A Kubernetes Secret with label `troubleshoot.sh/kind: support-bundle` is added as a Helm chart template. The secret embeds a `troubleshoot.sh/v1beta2` SupportBundle spec with log collectors for the app, PostgreSQL, and Redis pods. In CI, three always-run steps install the `support-bundle` CLI, collect the bundle from the live cluster using `--load-cluster-specs`, and upload it as a GitHub Actions artifact.

**Tech Stack:** Helm (Go templates), Kubernetes Secrets, Replicated Troubleshoot CLI (`support-bundle`), GitHub Actions (`actions/upload-artifact@v4`)

---

## File Map

| Action | File |
|--------|------|
| Create | `deploy/charts/templates/support-bundle.yaml` |
| Modify | `.github/workflows/e2e.yml` |

---

### Task 1: Add support-bundle Secret Helm template

**Files:**
- Create: `deploy/charts/templates/support-bundle.yaml`

- [ ] **Step 1: Create the template file**

Create `deploy/charts/templates/support-bundle.yaml` with the following content:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "playball-exe.fullname" . }}-support-bundle
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
    troubleshoot.sh/kind: support-bundle
stringData:
  support-bundle-spec: |
    apiVersion: troubleshoot.sh/v1beta2
    kind: SupportBundle
    metadata:
      name: {{ include "playball-exe.fullname" . }}
    spec:
      collectors:
        - logs:
            name: app
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=playball-exe
        - logs:
            name: postgres
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=postgresql
              - app.kubernetes.io/instance={{ .Release.Name }}
        - logs:
            name: redis
            namespace: {{ .Release.Namespace }}
            selector:
              - app.kubernetes.io/name=redis
              - app.kubernetes.io/instance={{ .Release.Name }}
```

- [ ] **Step 2: Verify the template renders correctly**

Run:
```bash
helm template test-release deploy/charts --set nextauth.secret=test
```

Expected: output includes a Secret named `test-release-support-bundle` with label `troubleshoot.sh/kind: support-bundle` and the embedded spec with `namespace: default` and `instance: test-release`.

- [ ] **Step 3: Lint the chart**

Run:
```bash
helm lint deploy/charts --set nextauth.secret=test
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 4: Run npm tests**

Run:
```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add deploy/charts/templates/support-bundle.yaml
git commit -m "feat: add support bundle spec as helm chart secret"
```

---

### Task 2: Add support bundle collection to e2e CI workflow

**Files:**
- Modify: `.github/workflows/e2e.yml`

The three new steps all have `if: always()` and are inserted **after** the `Test registration` step and **before** the `Archive customer` step, so the cluster is still live when the bundle is collected.

- [ ] **Step 1: Add the Install support-bundle step**

In `.github/workflows/e2e.yml`, insert after the `Test registration` step (after line ~118):

```yaml
      - name: Install support-bundle CLI
        if: always() && steps.create-cluster.outcome != 'skipped'
        run: |
          curl -fsSL https://github.com/replicatedhq/troubleshoot/releases/latest/download/support-bundle_linux_amd64.tar.gz \
            | tar xz -C /tmp support-bundle
          sudo mv /tmp/support-bundle /usr/local/bin/support-bundle
```

- [ ] **Step 2: Add the Collect support bundle step**

Directly after the install step:

```yaml
      - name: Collect support bundle
        if: always() && steps.create-cluster.outcome != 'skipped'
        run: |
          support-bundle --load-cluster-specs \
            --output-file /tmp/support-bundle.tar.gz \
            --interactive=false
```

Note: `export-kubeconfig: "true"` on the `create-cluster` step writes the kubeconfig to `~/.kube/config`, so no `--kubeconfig` flag is needed. `--interactive=false` prevents the CLI from prompting in CI.

- [ ] **Step 3: Add the Upload artifact step**

Directly after the collect step:

```yaml
      - name: Upload support bundle
        if: always() && steps.create-cluster.outcome != 'skipped'
        uses: actions/upload-artifact@v4
        with:
          name: support-bundle-${{ github.run_id }}
          path: /tmp/support-bundle.tar.gz
          retention-days: 7
```

- [ ] **Step 4: Verify the workflow YAML is valid**

Run:
```bash
helm lint deploy/charts --set nextauth.secret=test
```

(The pre-push checklist doesn't include workflow linting, but check the final YAML indentation visually — GitHub Actions is whitespace-sensitive. The three new steps must align with other steps at 6-space indent under `steps:`.)

- [ ] **Step 5: Run npm tests**

Run:
```bash
npm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: collect and upload support bundle artifact in e2e workflow"
```
