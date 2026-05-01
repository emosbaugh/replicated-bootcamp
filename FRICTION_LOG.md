# Friction Log

A running log of every friction point encountered during the Replicated Bootcamp.
Shared at the end of the exercise as structured developer experience feedback.

---

## Replicated CLI, API & CMX

### Entry 1 — 2026-04-06 — blocker

**Trying to:** Run `replicated lint` as instructed by the `replicated config init` output
**Expected:** `replicated lint` would validate resources as advertised in the next-steps output
**Actual:** `Error: unknown command "lint" for "replicated"` — the command does not exist in the CLI
**Resolution:** Command should suggest `replicated release lint` rather than `replicated lint`
**Severity:** blocker

### Entry 2 — 2026-04-07 — blocker

**Trying to:** Pass a Helm values override file to the `replicatedhq/replicated-actions/helm-install@v1` action via its `values` input
**Expected:** The `values` input accepts a file path (the action description says "A values.yaml file to use")
**Actual:** The action treats `values` as inline YAML content — not a file path. Passing `/tmp/ci-values.yaml` caused the action to write that literal string to a temp file and fail to parse it: `cannot unmarshal string into Go value of type map[string]interface{}`
**Resolution:** Rewrote the step to pass inline YAML via `values: |` with the secret pre-generated into `GITHUB_ENV`; took ~30 minutes to diagnose from a cryptic error message
**Severity:** blocker

### Entry 3 — 2026-04-07 — blocker

**Trying to:** Install a Helm chart via the Replicated OCI registry using `helm-install` action
**Expected:** Install succeeds; no mention in Replicated docs that charts need to allow `global` in their schema
**Actual:** Helm failed with `additional properties 'global' not allowed` — the Replicated registry injects `global.replicated` into chart values at install time, which is rejected by any chart with `additionalProperties: false` at the root of `values.schema.json`
**Resolution:** Added `"global": { "type": "object" }` to `values.schema.json` properties; error only surfaces at install time, not at lint or release-create time — ~20 minutes to diagnose
**Severity:** blocker

### Entry 4 — 2026-04-07 — blocker

**Trying to:** Craft a minimal RBAC policy for a CI service account that can lint releases, create/promote/archive channels and releases, manage dev licenses, and spin up CMX clusters.
**Expected:** The RBAC resource names and their effects would be discoverable from one place, with clear documentation of which resources are required for which CLI/API operations.
**Actual:** The resource names are documented on a separate page from the policy configuration guide, with no mapping between CLI commands (e.g. `replicated release lint`) and the resources they require. The critical `kots/app/*/read` resource — which gates all app-scoped operations — is not mentioned in the policy guide and is easy to omit. The result is a cryptic "App not found" error at runtime rather than a permission-denied error, making the root cause hard to diagnose.
**Resolution:** Fetched the resource names reference page separately and cross-referenced with the CLI behavior; discovered `kots/app/*/read` was missing only after the lint step failed in CI. Required outside investigation to connect the error to the missing permission.
**Severity:** blocker

### Entry 5 — 2026-04-07 — annoyance

**Trying to:** Determine whether the `.replicated` file needs a support bundle spec path, similar to how preflights are configured with an explicit `path` field.
**Expected:** Docs or CLI help to clearly explain whether support bundles are referenced in `.replicated` (like preflights are via `PreflightConfig.Path`) or whether they live only as in-chart manifests.
**Actual:** The `Config` struct in `pkg/tools/types.go` has a `Preflights` field with an explicit path, but no equivalent `SupportBundles` field. The linting section has a `SupportBundle` linter entry, but this only controls whether the linter checks for a spec — it does not reference a spec path. The docs at `support-bundle-customizing` make no mention of `.replicated` at all. The asymmetry between preflights (path-configured) and support bundles (chart-embedded only) is undocumented.
**Resolution:** Inferred from reading `types.go` source directly and confirming via docs that support bundles are always embedded in chart templates (as a Secret or CRD) and never path-referenced in `.replicated`. Took ~15 minutes of cross-referencing source and docs.
**Severity:** annoyance

### Entry 6 — 2026-04-07 — blocker

**Trying to:** Specify the output file path for the `support-bundle` CLI in a CI step.
**Expected:** `--output-file` flag to exist, as it does in many similar CLIs.
**Actual:** `--output-file` is not a valid flag — the CLI errors with `unknown flag: --output-file`. The correct flag is `--output`. Additionally, the path passed to `--output` should omit the `.tar.gz` extension, which the CLI appends automatically — this is undocumented. Neither the troubleshoot.sh docs nor the Replicated docs mention the exact flag name or this extension behavior.
**Resolution:** Found the correct flag (`--output`) by reading cobra flag definitions in `cmd/troubleshoot/cli/root.go` on GitHub. Took ~20 minutes of searching docs and fetching source files. Caught only after CI failure.
**Severity:** blocker

### Entry 7 — 2026-04-08 — blocker

**Trying to:** Use the `http` collector to check `/api/healthz` and analyze the response with `textAnalyze`
**Expected:** The collector would make the HTTP request in-cluster (since the bundle spec is deployed as a cluster resource), and the file would land at `http/{name}/response.json` as the `fileName` field suggested
**Actual:** Two separate problems: (1) The `http` collector makes the request from wherever the `support-bundle` binary runs — not from inside the cluster — so `*.svc.cluster.local` DNS fails on CI runners and developer laptops. (2) The output file path is `{name}/result.json` on error and `{name}/response.json` on success, not `http/{name}/response.json` — the `http/` prefix in docs examples is misleading.
**Resolution:** Replaced the `http` collector with an `exec` collector that runs `wget` inside the app pod, making the request always in-cluster regardless of where `support-bundle` runs.
**Severity:** blocker

### Entry 8 — 2026-04-08 — blocker

**Trying to:** Create a CMX VM using `replicated vm create` for the first time
**Expected:** VM creation to succeed, or a clear error if the account lacks permissions
**Actual:** Got a warning about needing to accept the Compatibility Matrix terms of service, but the real issue was an RBAC problem — the service account did not have permission to create VMs
**Resolution:** Unclear from the warning message that RBAC was the root cause; the ToS message is a red herring that sends you down the wrong path
**Severity:** blocker

### Entry 9 — 2026-04-08 — annoyance

**Trying to:** Enable embedded cluster download (and airgap) on a customer via the `replicatedhq/replicated-actions/create-customer@v1` GitHub Action
**Expected:** `is-embedded-cluster-download-enabled` and `is-airgap-enabled` to be valid inputs, consistent with `is-kots-install-enabled` which the action does support
**Actual:** The action silently ignores both inputs with warnings: "Unexpected input(s) 'is-embedded-cluster-download-enabled'" / "'is-airgap-enabled'" — the EC download and airgap flags are not exposed even though the underlying API and CLI support them
**Resolution:** Replaced the action with a direct `replicated customer create --embedded-cluster-download --airgap ...` CLI call; required parsing JSON/YAML output to capture customer-id and license-id that the action would have provided as named outputs
**Severity:** annoyance

### Entry 10 — 2026-04-08 — blocker

**Trying to:** Configure an `exec` collector to run a health check inside the app pod and analyze the output with `textAnalyze`
**Expected:** `containerName` selects which container to exec into and appears in the output path; `localhost` resolves correctly inside the container; the stdout file is named `{collectorName}-stdout`
**Actual:** Three undocumented behaviors compounded: (1) `containerName` is silently ignored for output file naming — the filename prefix comes from `collectorName`, not `containerName`. Without a `collectorName`, files land as `-stdout.txt`, `-stderr.txt`, `-errors.json` (empty prefix), and the `textAnalyze` glob never matches. (2) `localhost` resolves to `::1` (IPv6) in Alpine-based pods; since Next.js binds to IPv4 only, `wget localhost` gets connection refused — must use `127.0.0.1` explicitly. (3) The stdout file is named `{collectorName}-stdout.txt` (with `.txt` extension), not `{collectorName}-stdout` as the source-code format strings suggest.
**Resolution:** Added `collectorName: app-healthz`, changed URL to `http://127.0.0.1:3000/api/healthz`, and updated the `textAnalyze` `fileName` glob to `app-healthz/*/*/app-healthz-stdout.txt`. Required three CI bundle iterations to discover each issue.
**Severity:** blocker

### Entry 19 — 2026-04-30 — blocker

**Trying to:** Run `replicated channel ls` using credentials stored in the `.replicated` file (which `replicated config init` creates and many other commands consume)
**Expected:** The CLI would read the app slug and API token from `.replicated` automatically, just like `replicated release lint` does
**Actual:** `replicated channel ls` ignores the `.replicated` file entirely and requires either a `--app` flag or the `REPLICATED_APP` environment variable to be set explicitly. The error is a cryptic `Error: app slug or ID is required` even though `.replicated` exists in the current directory and contains a valid `app` field. This inconsistency is so unexpected that the CI workflow contains an inline comment: `# replicated channel ls does not support the .replicated config file`.
**Resolution:** Had to manually export `REPLICATED_APP=<slug>` before running the command; this is inconsistent with the documented workflow where `.replicated` is the canonical source of local configuration.
**Severity:** blocker

### Entry 20 — 2026-04-30 — blocker

**Trying to:** Create a release using the `replicatedhq/replicated-actions/release-create` GitHub Action in CI, relying on the `.replicated` file checked into the repo
**Expected:** The action would read app credentials and the app slug from `.replicated` in the repository root, consistent with local CLI behavior
**Actual:** The action does not load the `.replicated` file at all. It requires explicit `app-slug` and `api-token` inputs (or the `REPLICATED_APP` and `REPLICATED_API_TOKEN` env vars). This means the same repo that works locally with `replicated release create` fails in CI unless you duplicate the values into workflow secrets/inputs. The CI workflow ultimately had to use the raw CLI (`replicated release create`) instead of the action.
**Resolution:** Duplicated the app slug and token into GitHub Secrets and passed them as explicit action inputs, but this breaks the DRY promise of the `.replicated` file and is not documented in the action README.
**Severity:** blocker

---

## Enterprise Portal

### Entry 11 — 2026-04-25 — annoyance

**Trying to:** Complete the Enterprise Portal initial setup wizard by connecting GitHub and creating the content repo from the template
**Expected:** After clicking "Create Repo from Template" and creating the repo on GitHub, the wizard would automatically detect the new repo and allow linking it — or at least prompt you to grant access
**Actual:** After creating the repo from the template on GitHub, you are dropped back into the Vendor Portal wizard but the repo does not appear in the repository dropdown. You have to manually navigate to GitHub (Settings > Integrations > Applications > Replicated > Configure > Repository access) to grant the Replicated GitHub App access to the newly created repo before it appears. This extra step is not surfaced in the wizard UI and is only mentioned in a small "Tip" callout in the docs — easy to miss.
**Resolution:** Found the workaround in the docs tip under "Step 1: Connect GitHub": update the GitHub App's repository permissions to include the new repo, then return to the wizard. The docs do mention this but the wizard gives no indication that this step is needed.
**Severity:** annoyance

### Entry 12 — 2026-04-26 — annoyance

**Trying to:** Delete a branch from the Enterprise Portal content repo that was no longer needed
**Expected:** Deleting the branch on GitHub would be a clean operation — the branch disappears from EP's version list and syncs stop referencing it
**Actual:** After deleting the branch, every subsequent sync fails with a persistent error: `git clone failed: Cloning into '/tmp/ep-content-sync-...'... warning: Could not find remote branch <deleted-branch> to clone. fatal: Remote branch <deleted-branch> not found in upstream origin : exit status 128`. EP continues to attempt syncing the deleted branch on every push, and the error appears in the Content tab sync status permanently.
**Resolution:** Unknown — no docs mention how to remove a stale branch reference from EP's sync state. The docs say "To unpublish a version from the dropdown, delete the branch" but do not mention that EP may retain a reference to it and continue failing to sync it.
**Severity:** annoyance

### Entry 13 — 2026-04-27 — annoyance

**Trying to:** Delete a branch in the EP content repo and have the vendor portal EP content tab reflect the change gracefully
**Expected:** The vendor portal to handle a deleted branch silently or with a clear "branch no longer exists" message
**Actual:** The vendor portal EP content tab displays a raw git error: `git clone failed: Cloning into '/tmp/ep-content-sync-188875601'... warning: Could not find remote branch worktree-magical-marinating-emerson to clone. fatal: Remote branch worktree-magical-marinating-emerson not found in upstream origin : exit status 128` — a low-level git subprocess error surfaced verbatim in the UI with no guidance on what caused it or what to do
**Resolution:** The error is benign once you recognize it means the previously-configured branch no longer exists, but the raw git output makes it look like a portal or infrastructure failure rather than a stale branch reference
**Severity:** annoyance

### Entry 14 — 2026-04-27 — blocker

**Trying to:** Sign up a new customer via the vendor portal and send them an Enterprise Portal invite using the invite checkbox during customer creation
**Expected:** The customer record to be created with "Use new Enterprise Portal for this customer" enabled, since the invite checkbox implies EP access
**Actual:** The customer is created with "Use new Enterprise Portal for this customer" set to false despite the EP invite checkbox being selected — the invite may be sent but the customer cannot actually access EP because the flag is not set
**Resolution:** Must manually edit the customer after creation to enable "Use new Enterprise Portal for this customer"; the checkbox and the flag appear to be wired independently when they should be coupled
**Severity:** blocker

### Entry 15 — 2026-04-27 — i-would-have-churned

**Trying to:** Log in as a customer who has "Use new Enterprise Portal for this customer" enabled and access the new Enterprise Portal
**Expected:** Clicking login directs the customer to the new Enterprise Portal, or at minimum the old portal redirects to it once the flag is enabled
**Actual:** The old portal is shown despite the flag being enabled. The root cause was using the wrong URL — the correct EP URL (`https://playball-exe.enterpriseportal.app/main`) is not surfaced anywhere obvious during setup. Additionally, customers who were already invited before the flag was toggled on are never redirected from the old portal to the new one, and there is no mechanism for them to discover the new URL on their own.
**Resolution:** Discovered the correct EP URL through trial and error. Customers already on the old portal must be manually directed to the new URL — there is no redirect, no in-app prompt, and no email notification when EP is enabled after initial invite.
**Severity:** i-would-have-churned

### Entry 16 — 2026-04-28 — annoyance

**Trying to:** Preview the Enterprise Portal experience from the vendor portal for a customer with "Use new Enterprise Portal for this customer" enabled
**Expected:** The EP preview shows the new v2 Enterprise Portal
**Actual:** The EP preview renders the old portal, not the new v2 — despite confirming the customer had the new portal enabled. Makes it impossible to validate how the new EP will look to customers before they access it.
**Resolution:** [unknown]
**Severity:** annoyance

### Entry 17 — 2026-04-28 — blocker

**Trying to:** Create an instance in EP v2
**Expected:** Instance creation succeeds, or a meaningful error explaining what went wrong
**Actual:** The UI shows: `Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.` — the actual error is completely hidden, the digest value is not displayed anywhere in the UI, and there is no guidance on where to look to debug further
**Resolution:** [unknown]
**Severity:** blocker

### Entry 18 — 2026-04-27 — blocker

**Trying to:** Invite a user to the Enterprise Portal for a customer
**Expected:** Consistent behavior — if the customer overview page says Enterprise Portal is "Always enabled", the invite user flow should allow sending invites
**Actual:** The customer overview page shows Enterprise Portal as "Always enabled", but clicking "Invite User" shows the error "Enterprise Portal is not enabled for this customer. Users cannot be invited until it is enabled." — contradicting the overview page
**Resolution:** [unknown]
**Severity:** blocker

---

## GitHub Actions & CI Workflow Friction

The following friction points were discovered by reviewing the `.github/workflows/` directory and represent gaps where official Replicated actions could have been used but were not available, or where CLI behavior made CI authoring unnecessarily difficult.

### Entry 21 — 2026-05-01 — annoyance

**Trying to:** Install the Replicated CLI in CI jobs
**Expected:** An official `replicatedhq/replicated-actions/setup-replicated@v1` action (or similar) that pins or resolves the latest version
**Actual:** Five workflows (`build-test`, `release`, `e2e-ec3`, `e2e-ec3-airgap`, `cleanup`) duplicate the same curl + `grep -Po` + tar install block. The version resolution uses regex on GitHub's API JSON, which is fragile.
**Resolution:** All workflows carry the same 8-line shell install block. A single composite action would eliminate this duplication and make version pinning trivial.
**Severity:** annoyance

### Entry 22 — 2026-05-01 — blocker

**Trying to:** Use GitHub Actions for the EC v3 E2E tests, as one would for the k8s E2E tests
**Expected:** Actions for `create-vm`, `wait-for-vm`, `vm-ssh-endpoint`, `vm-scp-endpoint`, `network-update`, `remove-vm`
**Actual:** The `e2e-ec3.yml` and `e2e-ec3-airgap.yml` workflows are ~230 lines of shell scripts because no VM actions exist. This makes them much harder to maintain and debug than the k8s E2E workflow (`e2e.yml`), which does use actions.
**Resolution:** All VM operations (create, wait, SSH/SCP endpoint resolution, network policy changes, deletion) must be written as raw shell. One syntax error in `sed` parsing can break the entire job.
**Severity:** blocker

### Entry 23 — 2026-05-01 — annoyance

**Trying to:** Use the SSH/SCP endpoint strings from `replicated vm ssh-endpoint` / `scp-endpoint` in a GitHub Actions step
**Expected:** The CLI outputs `--host` and `--port` as separate fields, or there are action outputs for them
**Actual:** The endpoint is a single string like `ssh://ci@host:port`. Every workflow step that needs to SSH or SCP duplicates `sed` + `cut` parsing:
```bash
SSH_HOST=$(echo "$SSH_ENDPOINT" | sed 's|[a-z]*://[^@]*@||' | cut -d: -f1)
SSH_PORT=$(echo "$SSH_ENDPOINT" | cut -d: -f3)
```
**Resolution:** This parsing is repeated 6+ times in each VM workflow. A `--format` flag or dedicated action outputs would eliminate the need for shell string splitting.
**Severity:** annoyance

### Entry 24 — 2026-05-01 — annoyance

**Trying to:** Extract the license ID from `replicated customer download-license` in CI for use as a registry password
**Expected:** `--output json` or a dedicated command to get the license ID
**Actual:** The output is YAML. The workflow uses `grep 'licenseID:' | awk '{print $2}' | tr -d '"'` to extract it. This is brittle and requires ad-hoc YAML parsing in shell.
**Resolution:** Used the CLI with `--output json` for `customer create` but `download-license` has no equivalent. A `replicated customer license-id` subcommand or `--output json` flag would remove the need for shell grepping.
**Severity:** annoyance

### Entry 25 — 2026-05-01 — blocker

**Trying to:** Know when the airgap bundle is ready before starting the EC v3 airgap install in CI
**Expected:** A CLI command like `replicated release airgap-status --channel ... --version ...` or the `release-create` action to block until the bundle is ready
**Actual:** The workflow has to manually `curl https://replicated.app/embedded/playball-exe/${CHANNEL}/${VERSION}?airgap=true` in a `for` loop for up to 10 minutes. This is infrastructure detail leaking into user workflows.
**Resolution:** Added a 60-iteration poll loop with 10-second sleep in `e2e-ec3-airgap.yml`. The workflow author must know the exact URL pattern and HTTP status semantics.
**Severity:** blocker

### Entry 26 — 2026-05-01 — annoyance

**Trying to:** Pass the promoted channel slug to downstream E2E jobs after creating a release
**Expected:** `replicated release create --promote` would emit the channel slug/id as output
**Actual:** After `replicated release create --promote "${CHANNEL}" --ensure-channel`, the workflow must run a separate `replicated channel ls --output json | jq` query to discover the channel slug. This adds an extra API call and JSON parsing step that should be unnecessary.
**Resolution:** Added a second job step (`Discover channel properties`) that queries all channels and filters by name. If the channel was just created, this is a wasted API call.
**Severity:** annoyance

### Entry 27 — 2026-05-01 — annoyance

**Trying to:** Call `/v3/app/.../channel/.../airgap/build` or bulk-archive stale resources in a cleanup workflow
**Expected:** The CLI accepts the app slug (`playball-exe`) directly for all API paths, like many other commands do
**Actual:** The `replicated api` path uses the app UUID. The workflow must first call `replicated api get /v3/apps | jq -r '.apps[] | select(.slug == "playball-exe") | .id'` to resolve the slug to an ID before every subsequent API call.
**Resolution:** Every API-dependent workflow step starts with this lookup. A `--app-slug` flag on `replicated api` (or automatic resolution from `.replicated`) would eliminate this boilerplate.
**Severity:** annoyance

### Entry 28 — 2026-05-01 — annoyance

**Trying to:** Install `preflight` and `support-bundle` binaries in CI via GitHub Actions
**Expected:** `replicatedhq/replicated-actions/setup-preflight@v1` and `setup-support-bundle@v1` actions
**Actual:** Both are manually downloaded from the troubleshoot repo releases with curl + tar in `e2e.yml`.
**Resolution:** Duplicated the install block for both binaries. They are in a separate repo from the replicated CLI, so even a generic `setup-replicated` action would not cover them.
**Severity:** annoyance

### Entry 29 — 2026-05-01 — annoyance

**Trying to:** Clean up stale CI customers and PR channels older than 7 days
**Expected:** A CLI command like `replicated customer ls --older-than 7d --name-pattern 'ci-*'` or a bulk archive command/action
**Actual:** `cleanup.yml` is 62 lines of shell that loops through API responses, does epoch date math in bash, and calls `replicated api put` for each stale resource. There is no built-in filtering or bulk operation.
**Resolution:** Wrote a custom bash loop that pages through customers and channels, parses `createdAt` timestamps, compares epochs, and archives one-by-one. A single `replicated customer archive --older-than 7d --name-prefix ci-` would replace ~40 lines.
**Severity:** annoyance

### Entry 30 — 2026-05-01 — blocker

**Trying to:** Use the `replicatedhq/replicated-actions/helm-install@v1` action for EC v3 airgap installs
**Expected:** The action exposes the same inputs for airgap/EC scenarios as it does for standard k8s installs
**Actual:** The EC v3 airgap and embedded-cluster workflows cannot use the `helm-install` action at all because they install via the embedded cluster binary (`playball-exe install`), not Helm directly. The action is only usable for the standard k8s E2E path.
**Resolution:** The k8s E2E uses the action; the EC3 and EC3-airgap workflows are entirely CLI/shell-driven. This bifurcation means there is no unified "install" action across deployment modes.
**Severity:** blocker

### Entry 31 — 2026-05-01 — blocker

**Trying to:** Pin the `support-bundle` binary version in the production Docker image so it does not auto-update at runtime
**Expected:** A CLI flag (`--no-auto-update`), a config file, or documented environment variable to disable auto-updates; or the binary to respect being run in a container and skip updates by default
**Actual:** There is no `--no-auto-update` flag, no config file option, and the env var `TROUBLESHOOT_AUTO_UPDATE=false` is undocumented in the Replicated docs, troubleshoot.sh docs, and `support-bundle --help`. The only way to discover it is to read the Go source code of the troubleshoot project (specifically `pkg/updatecheck/updatecheck.go`). Without setting it, the binary silently attempts to phone home and replace itself on every run.
**Resolution:** Found the env var by searching the troubleshoot repo source on GitHub. Added `ENV TROUBLESHOOT_AUTO_UPDATE=false` to the Dockerfile runner stage. This is not discoverable from any user-facing documentation.
**Severity:** blocker