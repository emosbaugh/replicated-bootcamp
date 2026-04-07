---
name: cmx-create-cluster
description: Use when creating, accessing, upgrading, or deleting a Replicated Compatibility Matrix (CMX) Kubernetes cluster for testing
---

# CMX: Create Cluster

## Overview

Provision on-demand Kubernetes clusters via the `replicated` CLI for testing. Always set `--ttl` and always delete when done.

## Prerequisites

- `replicated` CLI installed and authenticated
- `REPLICATED_API_TOKEN` set in environment (required for CLI auth)
- CMX credits available in the Vendor Portal

If credits are missing or CLI is unauthenticated, stop and notify the user.

## Create

```bash
replicated cluster create --distribution k3s --version 1.34 --ttl 2h
```

Supported distributions: `eks`, `gke`, `rke2`, `k3s`, `openshift`

| Flag | Description |
|------|-------------|
| `--distribution` | Kubernetes distribution |
| `--version` | Kubernetes version |
| `--name` | Cluster name |
| `--ttl` | Auto-delete after (e.g. `2h`, `24h`) |
| `--tag` | Key=value tag |
| `--node-count` | Number of nodes (default: 1) |

## Access

```bash
export KUBECONFIG=$(replicated cluster kubeconfig <cluster-id> --output-path /tmp/kubeconfig)
```

Get `<cluster-id>` from create output or `replicated cluster ls`.

## Upgrade

```bash
replicated cluster upgrade <cluster-id> --version 1.34
```

## Delete

Always delete clusters when done. Do not leave them running.

```bash
replicated cluster rm <cluster-id>
```

## Create + Deploy in One Step

```bash
replicated cluster prepare
```

## Port Expose

Expose a service to the public internet for testing. Requires the Kubernetes service to be **NodePort** (not ClusterIP).

```bash
# 1. If the Helm chart defaults to ClusterIP, upgrade to NodePort first
helm upgrade <release> <chart> --reuse-values --set service.type=NodePort

# 2. Get the assigned NodePort
kubectl get svc <service-name> -o jsonpath='{.spec.ports[0].nodePort}'

# 3. Expose it
replicated cluster port expose <cluster-id> --port <node-port> --protocol http,https
```

The command returns a public hostname (e.g. `https://vibrant-hoover.ingress.replicatedcluster.com`).

| Flag | Description |
|------|-------------|
| `--port` | NodePort to expose (required) |
| `--protocol` | `http`, `https`, `ws`, `wss` (default: `http,https`) |
| `--wildcard` | Create wildcard DNS + TLS cert |
| `--output` | `json\|table\|wide` |

```bash
# List exposed ports
replicated cluster port ls <cluster-id>

# Remove an exposed port
replicated cluster port rm <cluster-id> <port-id>
```

## CI Workflow

```bash
replicated cluster create --distribution k3s --version 1.34 --ttl 2h --name ci-test
export KUBECONFIG=$(replicated cluster kubeconfig <cluster-id> --output-path /tmp/kubeconfig)
# ... run tests ...
replicated cluster rm <cluster-id>
```
