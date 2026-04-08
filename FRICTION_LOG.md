# Friction Log

A running log of every friction point encountered during the Replicated Bootcamp.
Shared at the end of the exercise as structured developer experience feedback.

---

## Entry 1 — 2026-04-06 — blocker

**Trying to:** Run `replicated lint` as instructed by the `replicated config init` output
**Expected:** `replicated lint` would validate resources as advertised in the next-steps output
**Actual:** `Error: unknown command "lint" for "replicated"` — the command does not exist in the CLI
**Resolution:** Command should suggest `replicated release lint` rather than `replicated lint`
**Severity:** blocker

## Entry 2 — 2026-04-07 — blocker

**Trying to:** Pass a Helm values override file to the `replicatedhq/replicated-actions/helm-install@v1` action via its `values` input
**Expected:** The `values` input accepts a file path (the action description says "A values.yaml file to use")
**Actual:** The action treats `values` as inline YAML content — not a file path. Passing `/tmp/ci-values.yaml` caused the action to write that literal string to a temp file and fail to parse it: `cannot unmarshal string into Go value of type map[string]interface{}`
**Resolution:** Rewrote the step to pass inline YAML via `values: |` with the secret pre-generated into `GITHUB_ENV`; took ~30 minutes to diagnose from a cryptic error message
**Severity:** blocker

## Entry 3 — 2026-04-07 — blocker

**Trying to:** Install a Helm chart via the Replicated OCI registry using `helm-install` action
**Expected:** Install succeeds; no mention in Replicated docs that charts need to allow `global` in their schema
**Actual:** Helm failed with `additional properties 'global' not allowed` — the Replicated registry injects `global.replicated` into chart values at install time, which is rejected by any chart with `additionalProperties: false` at the root of `values.schema.json`
**Resolution:** Added `"global": { "type": "object" }` to `values.schema.json` properties; error only surfaces at install time, not at lint or release-create time — ~20 minutes to diagnose
**Severity:** blocker

## Entry 4 — 2026-04-07 — blocker

**Trying to:** Craft a minimal RBAC policy for a CI service account that can lint releases, create/promote/archive channels and releases, manage dev licenses, and spin up CMX clusters.
**Expected:** The RBAC resource names and their effects would be discoverable from one place, with clear documentation of which resources are required for which CLI/API operations.
**Actual:** The resource names are documented on a separate page from the policy configuration guide, with no mapping between CLI commands (e.g. `replicated release lint`) and the resources they require. The critical `kots/app/*/read` resource — which gates all app-scoped operations — is not mentioned in the policy guide and is easy to omit. The result is a cryptic "App not found" error at runtime rather than a permission-denied error, making the root cause hard to diagnose.
**Resolution:** Fetched the resource names reference page separately and cross-referenced with the CLI behavior; discovered `kots/app/*/read` was missing only after the lint step failed in CI. Required outside investigation to connect the error to the missing permission.
**Severity:** blocker

## Entry 5 — 2026-04-07 — annoyance

**Trying to:** Determine whether the `.replicated` file needs a support bundle spec path, similar to how preflights are configured with an explicit `path` field.
**Expected:** Docs or CLI help to clearly explain whether support bundles are referenced in `.replicated` (like preflights are via `PreflightConfig.Path`) or whether they live only as in-chart manifests.
**Actual:** The `Config` struct in `pkg/tools/types.go` has a `Preflights` field with an explicit path, but no equivalent `SupportBundles` field. The linting section has a `SupportBundle` linter entry, but this only controls whether the linter checks for a spec — it does not reference a spec path. The docs at `support-bundle-customizing` make no mention of `.replicated` at all. The asymmetry between preflights (path-configured) and support bundles (chart-embedded only) is undocumented.
**Resolution:** Inferred from reading `types.go` source directly and confirming via docs that support bundles are always embedded in chart templates (as a Secret or CRD) and never path-referenced in `.replicated`. Took ~15 minutes of cross-referencing source and docs.
**Severity:** annoyance

## Entry 6 — 2026-04-07 — annoyance

**Trying to:** Determine whether the `.replicated` file needs a support bundle spec path, similar to how preflights are configured with an explicit `path` field.
**Expected:** Docs or CLI help to clearly explain whether support bundles are referenced in `.replicated` (like preflights are via `PreflightConfig.Path`) or whether they live only as in-chart manifests.
**Actual:** The `Config` struct in `pkg/tools/types.go` has a `Preflights` field with an explicit path, but no equivalent `SupportBundles` field. The linting section has a `SupportBundle` linter entry, but this only controls whether the linter checks for a spec — it does not reference a spec path. The docs at `support-bundle-customizing` make no mention of `.replicated` at all. The asymmetry between preflights (path-configured) and support bundles (chart-embedded only) is undocumented.
**Resolution:** Inferred from reading `types.go` source directly and confirming via docs that support bundles are always embedded in chart templates (as a Secret or CRD) and never path-referenced in `.replicated`. Took ~15 minutes of cross-referencing source and docs.
**Severity:** annoyance

## Entry 7 — 2026-04-07 — blocker

**Trying to:** Specify the output file path for the `support-bundle` CLI in a CI step.
**Expected:** `--output-file` flag to exist, as it does in many similar CLIs.
**Actual:** `--output-file` is not a valid flag — the CLI errors with `unknown flag: --output-file`. The correct flag is `--output`. Additionally, the path passed to `--output` should omit the `.tar.gz` extension, which the CLI appends automatically — this is undocumented. Neither the troubleshoot.sh docs nor the Replicated docs mention the exact flag name or this extension behavior.
**Resolution:** Found the correct flag (`--output`) by reading cobra flag definitions in `cmd/troubleshoot/cli/root.go` on GitHub. Took ~20 minutes of searching docs and fetching source files. Caught only after CI failure.
**Severity:** blocker
