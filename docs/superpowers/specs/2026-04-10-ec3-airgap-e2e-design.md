# E2E EC3 Airgap Test Design

**Date:** 2026-04-10

## Overview

Add a new GitHub Actions workflow (`e2e-ec3-airgap.yml`) that tests the Embedded Cluster v3 airgap install path on a CMX VM. The test downloads the airgap bundle while the VM has internet access, then cuts internet connectivity before running the installer, exercising a true airgap scenario.

## Files Changed

- **New:** `.github/workflows/e2e-ec3-airgap.yml`
- **Modified:** `.github/workflows/build-test.yml` — add `e2e-ec3-airgap` job and update `archive-channel` dependencies

## Workflow Design

### Inputs

Same as `e2e-ec3.yml`: `image-tag`, `pr-number`, `channel-slug`, `version`.

### Steps

1. **Install Replicated CLI** — same as e2e-ec3.yml

2. **Create test customer** — `--airgap --embedded-cluster-download --type dev`
   - `--airgap` enables airgap installs (required to download the `.airgap` bundle)
   - `--embedded-cluster-download` enables fetching the installer binary
   - Outputs: `customer-id`, `license-id`

3. **Generate SSH keypair** — same as e2e-ec3.yml

4. **Generate installer password** — same as e2e-ec3.yml

5. **Create CMX VM** — `--distribution ubuntu --version 24.04 --instance-type r1.large --ttl 1h`
   - No `--network-policy` at creation time (VM needs internet to download the bundle)
   - Capture both VM ID and network ID from `--output json`:
     - `VM_ID=$(... | jq -r '.[0].id')`
     - `NETWORK_ID=$(... | jq -r '.[0].networkId')`

6. **Wait for VM running** — same poll loop as e2e-ec3.yml (60 × 10s)

7. **Write config-values.yaml** — same as e2e-ec3.yml

8. **SCP config-values.yaml to VM** — same as e2e-ec3.yml

9. **Poll for airgap bundle availability** — on the runner, `curl --head` with `Authorization: ${LICENSE_ID}` against:
   ```
   https://replicated.app/embedded/playball-exe/${CHANNEL}/${VERSION}?airgap=true
   ```
   Retry up to 60 times × 10s = 10 minute timeout. Airgap bundles are generated asynchronously after a release is promoted and are not immediately available.

10. **Download installer + airgap bundle on VM** — single SSH command:
    ```bash
    curl -f "https://replicated.app/embedded/playball-exe/${CHANNEL}/${VERSION}" \
      -H "Authorization: ${LICENSE_ID}" -o playball-exe.tgz
    curl -f "https://replicated.app/embedded/playball-exe/${CHANNEL}/${VERSION}?airgap=true" \
      -H "Authorization: ${LICENSE_ID}" -o playball-exe.airgap
    ```

11. **Cut internet** — on the runner:
    ```bash
    replicated network update "${NETWORK_ID}" --policy airgap --token $REPLICATED_API_TOKEN
    ```

12. **Install on VM** — SSH command:
    ```bash
    tar xzf playball-exe.tgz
    sudo ./playball-exe install \
      --airgap-bundle playball-exe.airgap \
      --license license.yaml \
      --headless --yes \
      --installer-password "${INSTALLER_PASSWORD}" \
      --config-values /tmp/config-values.yaml
    ```

13. **Validate HTTPS** — same as e2e-ec3.yml (HTTP 301/308 on port 80, HTTPS 200 on port 443)

14. **Collect support bundle** — same as e2e-ec3.yml (`always()`, `continue-on-error: true`)

15. **Upload support bundle artifact** — same as e2e-ec3.yml

16. **Archive customer** — same as e2e-ec3.yml (replicatedhq/replicated-actions/archive-customer@v1)

17. **Delete VM** — same as e2e-ec3.yml (`replicated vm rm`)

### build-test.yml Changes

Add `e2e-ec3-airgap` as a parallel job alongside `e2e-ec3`:

```yaml
e2e-ec3-airgap:
  needs: [release]
  uses: ./.github/workflows/e2e-ec3-airgap.yml
  with:
    image-tag: pr-${{ github.event.pull_request.number }}
    pr-number: ${{ github.event.pull_request.number }}
    channel-slug: ${{ needs.release.outputs.channel-slug }}
    version: ${{ needs.release.outputs.version }}
  secrets: inherit
```

Update `archive-channel` needs to include `e2e-ec3-airgap`:

```yaml
archive-channel:
  needs: [release, e2e, e2e-ec3, e2e-ec3-airgap]
```

## Key Differences from e2e-ec3.yml

| | e2e-ec3.yml | e2e-ec3-airgap.yml |
|---|---|---|
| Customer flags | `--embedded-cluster-download` | `--airgap --embedded-cluster-download` |
| Network policy | (none) | Cut to airgap after download |
| Bundle download | On VM, installer only | On VM, installer + `.airgap` bundle |
| Install flag | (none) | `--airgap-bundle playball-exe.airgap` |
| Extra polling step | (none) | Poll runner until airgap bundle ready |

## Error Handling

- Airgap bundle poll timeout: fail with explicit message after 10 minutes
- Support bundle collection: always runs, `continue-on-error: true`
- Customer archive and VM delete: always run (cleanup guards)
