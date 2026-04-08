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

## Entry 8 — 2026-04-08 — blocker

**Trying to:** Use the `http` collector to check `/api/healthz` and analyze the response with `textAnalyze`
**Expected:** The collector would make the HTTP request in-cluster (since the bundle spec is deployed as a cluster resource), and the file would land at `http/{name}/response.json` as the `fileName` field suggested
**Actual:** Two separate problems: (1) The `http` collector makes the request from wherever the `support-bundle` binary runs — not from inside the cluster — so `*.svc.cluster.local` DNS fails on CI runners and developer laptops. (2) The output file path is `{name}/result.json` on error and `{name}/response.json` on success, not `http/{name}/response.json` — the `http/` prefix in docs examples is misleading.
**Resolution:** Replaced the `http` collector with an `exec` collector that runs `wget` inside the app pod, making the request always in-cluster regardless of where `support-bundle` runs.
**Severity:** blocker

## Entry 9 — 2026-04-08 — blocker

**Trying to:** Create a CMX VM using `replicated vm create` for the first time
**Expected:** VM creation to succeed, or a clear error if the account lacks permissions
**Actual:** Got a warning about needing to accept the Compatibility Matrix terms of service, but the real issue was an RBAC problem — the service account did not have permission to create VMs
**Resolution:** Unclear from the warning message that RBAC was the root cause; the ToS message is a red herring that sends you down the wrong path
**Severity:** blocker

## Entry 10 — 2026-04-08 — annoyance

**Trying to:** Enable embedded cluster download on a customer via the `replicatedhq/replicated-actions/create-customer@v1` GitHub Action
**Expected:** `is-embedded-cluster-download-enabled` to be a valid input, consistent with `is-kots-install-enabled` which the action does support
**Actual:** The action silently ignores the input with a warning: "Unexpected input(s) 'is-embedded-cluster-download-enabled', valid inputs are [...]" — the EC download flag is not exposed even though the underlying API supports it
**Resolution:** Replaced the action with a direct `replicated customer create --embedded-cluster-download` CLI call; required parsing JSON output to capture customer-id and license-id that the action would have provided as named outputs
**Severity:** annoyance

## Entry 11 — 2026-04-08 — blocker

**Trying to:** Configure an `exec` collector to run a health check inside the app pod and analyze the output with `textAnalyze`
**Expected:** `containerName` selects which container to exec into and appears in the output path; `localhost` resolves correctly inside the container; the stdout file is named `{collectorName}-stdout`
**Actual:** Three undocumented behaviors compounded: (1) `containerName` is silently ignored for output file naming — the filename prefix comes from `collectorName`, not `containerName`. Without a `collectorName`, files land as `-stdout.txt`, `-stderr.txt`, `-errors.json` (empty prefix), and the `textAnalyze` glob never matches. (2) `localhost` resolves to `::1` (IPv6) in Alpine-based pods; since Next.js binds to IPv4 only, `wget localhost` gets connection refused — must use `127.0.0.1` explicitly. (3) The stdout file is named `{collectorName}-stdout.txt` (with `.txt` extension), not `{collectorName}-stdout` as the source-code format strings suggest.
**Resolution:** Added `collectorName: app-healthz`, changed URL to `http://127.0.0.1:3000/api/healthz`, and updated the `textAnalyze` `fileName` glob to `app-healthz/*/*/app-healthz-stdout.txt`. Required three CI bundle iterations to discover each issue.
**Severity:** blocker
