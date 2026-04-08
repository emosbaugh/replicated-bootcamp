# Testing with Embedded Cluster v3

Use the [Replicated Compatibility Matrix (CMX)](https://docs.replicated.com/vendor/testing-about) to spin up an on-demand Ubuntu VM and test EC v3 installation end-to-end.

## Prerequisites

- `replicated` CLI installed and authenticated
- `REPLICATED_API_TOKEN` set in your environment
- `helm` installed
- SSH key at `.ssh/id_ed25519` (see below)

## Generate SSH Key

VMs require an SSH key. Generate one if not present:

```bash
mkdir -p .ssh
ssh-keygen -t ed25519 -f .ssh/id_ed25519 -N "" -C "ethan@cmx"
```

The private key is gitignored. The public key is committed.

## Create a Release

Package the chart and create a Replicated release:

```bash
HELM_VERSION="0.1.0-ec3-test"
helm dependency update deploy/charts
helm package deploy/charts -d deploy/manifests --version "$HELM_VERSION"

replicated release create \
  --yaml-dir deploy/manifests \
  --version "$HELM_VERSION" \
  --promote Unstable \
  --token $REPLICATED_API_TOKEN \
  --app playball-exe

rm deploy/manifests/*.tgz
```

Note the channel slug (e.g. `unstable`) from the output.

## Create a Customer

```bash
replicated customer create \
  --name "ec3-test" \
  --channel Unstable \
  --type dev \
  --embedded-cluster-download \
  --token $REPLICATED_API_TOKEN \
  --app playball-exe
```

Note the license ID from the output.

## Create a VM

```bash
replicated vm create \
  --distribution ubuntu \
  --version 24.04 \
  --ttl 2h \
  --ssh-public-key .ssh/id_ed25519.pub \
  --token $REPLICATED_API_TOKEN
```

Wait for `STATUS` to show `running`:

```bash
replicated vm ls --token $REPLICATED_API_TOKEN
```

Note the VM ID.

## Create config-values.yaml

```bash
cat > /tmp/config-values.yaml <<'EOF'
apiVersion: kots.io/v1beta1
kind: ConfigValues
spec:
  values:
    postgresql_enabled:
      value: "1"
    redis_enabled:
      value: "1"
EOF
```

## SCP config-values.yaml to VM

```bash
USERNAME=$(cut -d' ' -f3 .ssh/id_ed25519.pub | cut -d'@' -f1)
SCP_ENDPOINT=$(replicated vm scp-endpoint <vm-id> --username "$USERNAME" --token $REPLICATED_API_TOKEN)
SCP_HOST=$(echo "$SCP_ENDPOINT" | sed 's|ssh://[^@]*@||' | cut -d: -f1)
SCP_PORT=$(echo "$SCP_ENDPOINT" | cut -d: -f3)

scp -i .ssh/id_ed25519 \
  -P "$SCP_PORT" \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  /tmp/config-values.yaml \
  "${USERNAME}@${SCP_HOST}:/tmp/config-values.yaml"
```

## SSH and Install

```bash
SSH_ENDPOINT=$(replicated vm ssh-endpoint <vm-id> --username "$USERNAME" --token $REPLICATED_API_TOKEN)
SSH_HOST=$(echo "$SSH_ENDPOINT" | sed 's|ssh://[^@]*@||' | cut -d: -f1)
SSH_PORT=$(echo "$SSH_ENDPOINT" | cut -d: -f3)

ssh -i .ssh/id_ed25519 \
  -p "$SSH_PORT" \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  "${USERNAME}@${SSH_HOST}"
```

On the VM, download and run the installer (the license is embedded in the tgz):

```bash
# Replace <channel-slug>, <version>, and <license-id> with your values
curl -f "https://replicated.app/embedded/playball-exe/<channel-slug>/<version>" \
  -H "Authorization: <license-id>" \
  -o playball-exe.tgz

tar xzf playball-exe.tgz

sudo ./playball-exe install \
  --license license.yaml \
  --headless \
  --yes \
  --installer-password "yourpassword" \
  --config-values /tmp/config-values.yaml
```

## Access Admin Console

After install completes, expose port 30080:

```bash
replicated vm port expose <vm-id> --port 30080 --protocol http,https --token $REPLICATED_API_TOKEN
```

The command returns a public URL. Open it in a browser to access the Admin Console.

## Clean Up

Always delete the VM and archive the customer when done:

```bash
replicated vm rm <vm-id> --token $REPLICATED_API_TOKEN
replicated customer archive <customer-id> --token $REPLICATED_API_TOKEN --app playball-exe
```
