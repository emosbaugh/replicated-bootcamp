# EC v3 Testing Design

**Date:** 2026-04-08

## Overview

Two deliverables:
1. `docs/testing-ec3.md` — manual testing guide for EC v3 installs on CMX VMs
2. `.github/workflows/e2e-ec3.yml` + changes to `e2e.yml` and `build-test.yml` — CI e2e that runs Helm and EC v3 tests in parallel against a shared release

The success criteria for the CI EC3 test is a clean install exit (non-zero exit code = failure). HTTP verification is out of scope for this version.

---

## `docs/testing-ec3.md`

Follows the same structure as `docs/testing-with-cmx.md`.

### Sections

1. **Prerequisites** — `replicated` CLI, `REPLICATED_API_TOKEN`, SSH key at `.ssh/id_ed25519`

2. **Create a release** — Package chart + create release with `--yaml-dir deploy/manifests`

3. **Create a customer** — `replicated customer create` with `--embedded-cluster-download` flag; note the license ID from output

4. **Create a VM** — `replicated vm create --distribution ubuntu --version 24.04 --ttl 2h --ssh-public-key .ssh/id_ed25519.pub`; poll until `running`

5. **Create config-values.yaml** — Write a minimal ConfigValues file locally:
   ```yaml
   apiVersion: kots.io/v1beta1
   kind: ConfigValues
   spec:
     values:
       postgresql_enabled:
         value: "1"
       redis_enabled:
         value: "1"
   ```

6. **SCP config-values.yaml to VM** — Use `replicated vm scp-endpoint` to get SCP endpoint, then `scp` the file

7. **SSH into VM** — Use `replicated vm ssh-endpoint` to get SSH endpoint

8. **On VM: download and install**
   ```bash
   curl -f "https://replicated.app/embedded/playball-exe/<channel-slug>/<version>" \
     -H "Authorization: <license-id>" -o playball-exe.tgz
   tar xzf playball-exe.tgz
   sudo ./playball-exe install \
     --license license.yaml \
     --headless \
     --yes \
     --installer-password <password> \
     --config-values /tmp/config-values.yaml
   ```
   The installer tgz contains `license.yaml` alongside the binary.

9. **Access Admin Console** — `replicated vm port expose <vm-id> --port 30080 --protocol http,https`; open the returned URL

10. **Clean up** — `replicated vm rm <vm-id>`

---

## CI Workflow Restructure

### Shared release model

Release creation moves out of `e2e.yml` into `build-test.yml` as a dedicated `release` job. Both `e2e` and `e2e-ec3` run in parallel against that shared release, each creating their own customer. Channel archiving happens in `build-test.yml` after both jobs complete.

```
build ──┐
        ├──► release ──► e2e      ──┐
lint  ──┘         └──► e2e-ec3   ──┴──► archive-channel
```

### `build-test.yml` changes

1. Add `release` job (needs: build, lint): package chart + create release, output `channel-slug` and `version`
2. `e2e` job: needs `release`; pass `channel-slug` and `version` as inputs
3. Add `e2e-ec3` job (parallel with `e2e`): needs `release`; pass same inputs
4. Add `archive-channel` job (needs: e2e, e2e-ec3, `if: always()`): archives the shared channel

### `e2e.yml` changes

- Remove the "Package Helm chart" and "Create and promote Replicated release" steps
- Add `channel-slug` and `version` as required `workflow_call` inputs
- Remove "Archive channel" cleanup step (now handled by `build-test.yml`)

### `.github/workflows/e2e-ec3.yml` (new)

**Trigger:** `workflow_call` with inputs `image-tag`, `pr-number`, `channel-slug`, `version`; plus `workflow_dispatch` for manual runs.

**Job: `e2e-ec3`** — `timeout-minutes: 30`

Steps:
1. Checkout
2. Install Replicated CLI
3. Create customer (`replicated customer create`) with `--embedded-cluster-download` flag; capture license ID
4. Generate SSH keypair — `ssh-keygen -t ed25519 -f .ssh/id_ed25519 -N "" -C "ci@cmx"`
5. Generate installer password — `openssl rand -hex 16`, store in env
6. Create CMX VM (ubuntu 24.04, ttl 1h, `--ssh-public-key .ssh/id_ed25519.pub`); capture VM ID; poll until running
7. Write `config-values.yaml` inline (bundled postgres + redis)
8. SCP `config-values.yaml` to VM (parse `scp-endpoint` for host/port/user)
9. SSH into VM and run:
   - `curl -f "https://replicated.app/embedded/playball-exe/<channel-slug>/<version>" -H "Authorization: <license-id>" -o playball-exe.tgz`
   - `tar xzf playball-exe.tgz`
   - `sudo ./playball-exe install --license license.yaml --headless --yes --installer-password $INSTALLER_PASSWORD --config-values /tmp/config-values.yaml`
10. Cleanup (`if: always()`): archive customer, delete VM

**SSH/SCP helpers:** Parse `ssh://user@host:port` URI from `replicated vm ssh-endpoint` / `scp-endpoint` to extract host, port, and username — same pattern as `cmx-create-vm` skill.

---

## Out of Scope

- HTTP verification / registration test (first version: clean install exit only)
- Multi-node / HA installs
- Air-gap installs
- External PostgreSQL / Redis config in CI
