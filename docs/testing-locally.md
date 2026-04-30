# Testing Locally with k3d

Use [k3d](https://k3d.io) to run postgres, redis, and the Replicated SDK in a local Kubernetes cluster while developing Next.js locally with `npm run dev`.

Two scripts handle everything:

| Command | Purpose |
|---------|---------|
| `make dev-setup` | One-time cluster creation, Helm install, `.env.local` config, and DB migration |
| `make dev-run` | Port-forwards all services and starts the Next.js dev server |

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

## Setup (once per environment)

```bash
REPLICATED_LICENSE_ID=<your-license-id> make dev-setup
```

This will:
1. Create a k3d cluster (`playball-dev`)
2. Install the Helm chart with postgres, redis, and the Replicated SDK
3. Create `.env.local` from `.env.example` with a generated `NEXTAUTH_SECRET`
4. Run database migrations and seed data

Re-running the script when `.env.local` already exists will leave it untouched.

## Start the Dev Server

```bash
make dev-run
```

This port-forwards postgres (`5432`), redis (`6379`), and the Replicated SDK (`3001`) to localhost, then starts the Next.js dev server at [http://localhost:3000](http://localhost:3000).

Press **Ctrl+C** to stop everything — port-forwards are cleaned up automatically.

## Clean Up

Delete the cluster when done:

```bash
k3d cluster delete playball-dev
```
