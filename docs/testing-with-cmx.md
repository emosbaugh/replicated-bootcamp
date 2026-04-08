# Testing with CMX

Use the [Replicated Compatibility Matrix (CMX)](https://docs.replicated.com/vendor/testing-about) to spin up on-demand Kubernetes clusters and test the Helm chart end-to-end.

## Prerequisites

- `replicated` CLI installed and authenticated
- `REPLICATED_API_TOKEN` set in your environment
- `helm` and `kubectl` installed

## Set Your License ID

The Replicated SDK requires a license to start. Get a dev license ID from the [Vendor Portal](https://vendor.replicated.com) and export it once at the start of your session:

```bash
export REPLICATED_LICENSE_ID=<your-license-id>
```

> **Note for AI assistants:** The Bash tool does not inherit shell environment variables. When running `helm install`, pass the license ID literally rather than relying on `${REPLICATED_LICENSE_ID}` expansion.


## Create a Cluster

```bash
replicated cluster create --distribution k3s --version 1.32 --ttl 2h --name playball-test
```

Wait for `STATUS` to show `running`:

```bash
replicated cluster ls
```

## Configure kubectl

```bash
replicated cluster kubeconfig <cluster-id> --output-path /tmp/kubeconfig-playball
export KUBECONFIG=/tmp/kubeconfig-playball
kubectl get nodes
```

## Build and Push a Local Image (optional)

To test local code changes without a CI build, push a throwaway image to [ttl.sh](https://ttl.sh) — an anonymous, no-auth registry that auto-deletes images when the TTL expires.

```bash
TAG=$(git rev-parse --short HEAD)
docker build -f deploy/Dockerfile --platform linux/amd64 -t ttl.sh/playball-exe-${TAG}:2h .
docker push ttl.sh/playball-exe-${TAG}:2h
```

> `--platform linux/amd64` is required — CMX clusters run on amd64, but Mac builds default to arm64.
> Choose a TTL long enough to last your test session (`:1h`, `:2h`, `:6h`, `:24h`). The image is public but ephemeral — no credentials needed.

Then pass the image coordinates when installing (see below).

## Install from the Replicated OCI Registry

To install a released version directly from the Replicated registry, log in first using the license ID as both username and password:

```bash
helm registry login registry.replicated.com \
  --username <license-id> \
  --password <license-id>
```

Then install:

```bash
helm install playball-exe oci://registry.replicated.com/playball-exe/playball-exe \
  --version <chart-version> \
  --set replicated.licenseID=<license-id> \
  --set nextauth.secret="$(openssl rand -base64 32)" \
  --set service.type=NodePort
```

> `service.type=NodePort` is required to expose the app publicly (see [Expose the App](#expose-the-app)).

## Install the Helm Chart

Images are proxied through `images.emosbaugh.be`, which requires authentication using your license ID. The `enterprise-pull-secret` is normally created automatically when installing via the Replicated OCI registry, but for local testing you must generate and pass `global.replicated.dockerconfigjson` yourself:

```bash
DOCKER_CONFIG=$(echo -n "{\"auths\":{\"images.emosbaugh.be\":{\"auth\":\"$(echo -n "${REPLICATED_LICENSE_ID}:${REPLICATED_LICENSE_ID}" | base64)\"}}}" | base64)
```

Then install:

```bash
helm install playball deploy/charts \
  --set nextauth.secret="$(openssl rand -base64 32)" \
  --set service.type=NodePort \
  --set replicated.integration.licenseID="${REPLICATED_LICENSE_ID}" \
  --set global.replicated.dockerconfigjson="${DOCKER_CONFIG}" \
  --wait --timeout 5m
```

If you pushed a local image to ttl.sh, also override the image:

```bash
helm install playball deploy/charts \
  --set nextauth.secret="$(openssl rand -base64 32)" \
  --set service.type=NodePort \
  --set replicated.integration.licenseID="${REPLICATED_LICENSE_ID}" \
  --set global.replicated.dockerconfigjson="${DOCKER_CONFIG}" \
  --set image.repository=ttl.sh/playball-exe-${TAG} \
  --set image.tag=2h \
  --wait --timeout 5m
```

> `service.type=NodePort` is required to expose the app publicly (see below).

## Expose the App

Get the NodePort assigned to the service:

```bash
kubectl get svc playball -o jsonpath='{.spec.ports[0].nodePort}'
```

Expose it:

```bash
replicated cluster port expose <cluster-id> --port <node-port> --protocol http,https
```

The command returns a public URL, e.g.:

```
https://vibrant-hoover.ingress.replicatedcluster.com
```

## Clean Up

Always delete the cluster when done:

```bash
replicated cluster rm <cluster-id>
```
