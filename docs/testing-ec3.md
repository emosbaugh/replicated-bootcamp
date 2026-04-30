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

Both the private and public key are gitignored — generate a new one each session.

## Create a Release

Package the chart and create a Replicated release:

```bash
RELEASE_VERSION="0.1.0-ec3-test"
PR_NUMBER="<your-pr-number>"  # e.g. 46 — used to select the right Docker image tag

# Stamps versions into deploy/charts/Chart.yaml and deploy/manifests/helmchart.yaml.
# IMAGE_TAG selects the branch Docker image built by CI (the default `main` tag won't have your branch's code).
make package-charts VERSION="$RELEASE_VERSION" IMAGE_TAG="pr-${PR_NUMBER}"

# Downloads the cert-manager and traefik chart archives into deploy/manifests/ so
# EC3 can find them at install time. Versions are read from embedded-cluster-config.yaml.
make bundle-extensions

replicated release create \
  --version "$RELEASE_VERSION" \
  --promote Unstable \
  --token $REPLICATED_API_TOKEN
```

Note the channel slug (e.g. `unstable`) and release version from the output.

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

Note the customer ID from the output, then download the license to get the **license ID**
(used in the `Authorization` header when downloading the installer — this is different from
the customer ID):

```bash
LICENSE_ID=$(replicated customer download-license \
  --customer <customer-id> \
  --app playball-exe \
  --token $REPLICATED_API_TOKEN \
  | grep 'licenseID:' | awk '{print $2}' | tr -d '"')
echo "License ID: $LICENSE_ID"
```

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

A sample is checked in at `deploy/config-values.yaml`. Copy it and set `hostname` to a DNS name that resolves to the VM's IP (e.g. using [nip.io](https://nip.io): `playball.<vm-ip>.nip.io`):

```bash
cp deploy/config-values.yaml /tmp/config-values.yaml
# Edit hostname before SCPing
```

Or generate it inline:

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
    hostname:
      value: "playball.<vm-ip>.nip.io"
EOF
```

## SCP config-values.yaml to VM

```bash
USERNAME=$(cut -d' ' -f3 .ssh/id_ed25519.pub | cut -d'@' -f1)
SCP_ENDPOINT=$(replicated vm scp-endpoint <vm-id> --username "$USERNAME" --token $REPLICATED_API_TOKEN)
SCP_HOST=$(echo "$SCP_ENDPOINT" | sed 's|[a-z]*://[^@]*@||' | cut -d: -f1)
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
SSH_HOST=$(echo "$SSH_ENDPOINT" | sed 's|[a-z]*://[^@]*@||' | cut -d: -f1)
SSH_PORT=$(echo "$SSH_ENDPOINT" | cut -d: -f3)

ssh -i .ssh/id_ed25519 \
  -p "$SSH_PORT" \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  "${USERNAME}@${SSH_HOST}"
```

On the VM, download and run the installer (the license is embedded in the tgz):

```bash
# Replace <channel-slug> and <release-version> with your values.
# <release-version> is the --version passed to `replicated release create` (e.g. 0.1.0-ec3-test)
# Authorization uses the licenseID from the license file — NOT the customer ID.
curl -f "https://replicated.app/embedded/playball-exe/<channel-slug>/<release-version>" \
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

If the application is already installed (e.g. re-releasing to the same VM), use `upgrade` instead:

```bash
sudo ./playball-exe upgrade \
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

## Access the App

Traefik listens on port 80. Expose it and open the hostname you configured:

```bash
replicated vm port expose <vm-id> --port 80 --protocol http --token $REPLICATED_API_TOKEN
```

The app will be accessible at `http://<hostname>` (where `<hostname>` is the value you set in config-values.yaml).

## Access the App via HTTPS

Traefik also listens on port 443 with a self-signed certificate. Expose it:

```bash
replicated vm port expose <vm-id> --port 443 --protocol https --token $REPLICATED_API_TOKEN
```

The app is accessible at the HTTPS URL. Your browser will show a certificate warning for the self-signed cert — proceed past it. HTTP traffic on port 80 redirects automatically to HTTPS.

## Accessing the Cluster

kubectl is bundled with the EC install at `/var/lib/playball-exe/bin/kubectl`:

```bash
sudo /var/lib/playball-exe/bin/kubectl get pods -A
sudo /var/lib/playball-exe/bin/kubectl get ingress -A
```

## Clean Up

Always delete the VM and archive the customer when done:

```bash
replicated vm rm <vm-id> --token $REPLICATED_API_TOKEN
replicated customer archive <customer-id> --token $REPLICATED_API_TOKEN --app playball-exe
```
