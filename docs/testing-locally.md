# Testing Locally with k3d

Use [k3d](https://k3d.io) to run postgres, redis, and the Replicated SDK in a local Kubernetes cluster while developing Next.js locally with `npm run dev`.

## Prerequisites

- [`k3d`](https://k3d.io/#installation) installed
- `kubectl` installed
- `helm` installed

## Set Your License ID

The Replicated SDK requires a license to start. Get a dev license ID from the [Vendor Portal](https://vendor.replicated.com) and export it once at the start of your session:

```bash
export REPLICATED_LICENSE_ID=<your-license-id>
```

> **Note for AI assistants:** The Bash tool does not inherit shell environment variables. When running `helm install`, pass the license ID literally rather than relying on `${REPLICATED_LICENSE_ID}` expansion.

## Create a Cluster

```bash
k3d cluster create playball-dev
```

Verify it's ready:

```bash
kubectl get nodes
```

## Install the Helm Chart

Images are proxied through `images.emosbaugh.be`, which requires authentication. Generate the pull secret config using your license ID:

```bash
DOCKER_CONFIG=$(echo -n "{\"auths\":{\"images.emosbaugh.be\":{\"auth\":\"$(echo -n "${REPLICATED_LICENSE_ID}:${REPLICATED_LICENSE_ID}" | base64)\"}}}" | base64)
```

Install with the dev values override — this disables the app Deployment and runs only postgres, redis, and the Replicated SDK:

```bash
helm install playball deploy/charts \
  -f deploy/charts/values.dev.yaml \
  --set replicated.integration.licenseID="${REPLICATED_LICENSE_ID}" \
  --set global.replicated.dockerconfigjson="${DOCKER_CONFIG}" \
  --wait --timeout 5m
```

Verify all pods are running:

```bash
kubectl get pods
```

## Port-Forward Services

Forward all three services to localhost (run these in the background):

```bash
kubectl port-forward svc/playball-postgresql 5432:5432 &
kubectl port-forward svc/playball-redis-master 6379:6379 &
kubectl port-forward svc/playball-exe-sdk 3001:3000 &
```

> The SDK is forwarded to port **3001** (not 3000) to avoid conflicting with the Next.js dev server.

## Configure the App

```bash
cp .env.example .env.local
```

Open `.env.local` and replace the `NEXTAUTH_SECRET` placeholder with a generated secret:

```bash
openssl rand -base64 32
```

The file already includes `REPLICATED_SDK_URL=http://localhost:3001` pointing to the port-forwarded SDK.

## Run Migrations

```bash
npx prisma migrate dev
npx prisma db seed
```

## Start the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Clean Up

Stop port-forwarding and delete the cluster when done:

```bash
kill %1 %2 %3
k3d cluster delete playball-dev
```
