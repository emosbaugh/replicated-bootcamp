---
name: cmx-create-vm
description: Use when creating, accessing via SSH, exposing ports, or deleting a Replicated Compatibility Matrix (CMX) virtual machine for testing
---

# CMX: Create VM

## Overview

Provision on-demand VMs via the `replicated` CLI for testing. Always set `--ttl`, always provide `--ssh-public-key`, and always delete when done.

## Prerequisites

- `replicated` CLI installed and authenticated
- `REPLICATED_API_TOKEN` set in environment (required for CLI auth)
- CMX credits available in the Vendor Portal

If credits are missing or CLI is unauthenticated, stop and notify the user.

## SSH Key Setup

VMs require an SSH public key. Use the project keypair at `.ssh/id_ed25519`. Generate if missing:

```bash
mkdir -p .ssh
ssh-keygen -t ed25519 -f .ssh/id_ed25519 -N "" -C "ethan@cmx"
```

The private key is gitignored. The public key is committed.

## Create

```bash
replicated vm create --distribution ubuntu --version 24.04 --ttl 2h --ssh-public-key .ssh/id_ed25519.pub
replicated vm create --distribution rocky --version 9 --ttl 2h --ssh-public-key .ssh/id_ed25519.pub
```

| Flag | Description |
|------|-------------|
| `--distribution` | OS distribution |
| `--version` | OS version |
| `--ssh-public-key` | Path to SSH public key (required) |
| `--instance-type` | Instance size |
| `--disk` | Disk size in GB |
| `--count` | Number of VMs |
| `--ttl` | Auto-delete after |

## Wait for Ready

VMs take 1–2 minutes. Poll until status is `running`:

```bash
while [ "$(replicated vm ls | grep <vm-id> | awk '{print $7}')" != "running" ]; do sleep 5; done
```

## SSH

Extract username from the key comment, then parse the `ssh://` URI:

```bash
USERNAME=$(cut -d' ' -f3 .ssh/id_ed25519.pub | cut -d'@' -f1)
ENDPOINT=$(replicated vm ssh-endpoint <vm-id> --username "$USERNAME")
HOST=$(echo "$ENDPOINT" | sed 's|ssh://[^@]*@||' | cut -d: -f1)
PORT=$(echo "$ENDPOINT" | cut -d: -f3)
ssh -i .ssh/id_ed25519 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p "$PORT" "$USERNAME@$HOST"
```

## Port Expose

Expose a port on the VM to the public internet. Unlike clusters, VMs are VM-based so no NodePort workaround is needed — expose the port your service listens on directly.

```bash
replicated vm port expose <vm-id> --port <port> --protocol http,https
```

The command returns a public hostname (e.g. `https://vibrant-hoover.ingress.replicatedcluster.com`).

| Flag | Description |
|------|-------------|
| `--port` | Port to expose (required) |
| `--protocol` | `http`, `https`, `ws`, `wss` (default: `http,https`) |
| `--wildcard` | Create wildcard DNS + TLS cert |
| `--output` | `json\|table\|wide` |

```bash
# List exposed ports
replicated vm port ls <vm-id>

# Remove an exposed port
replicated vm port rm <vm-id> <port-id>
```

## Delete

Always delete VMs when done. Do not leave them running.

```bash
replicated vm rm <vm-id>
```

## Networking

VMs and clusters can share a network (requires CLI 0.90.0+, supported on K3s/RKE2/OpenShift).

```bash
# Create multiple VMs on the same network
replicated vm create --distribution ubuntu --version 24.04 --ttl 2h --count 3 --ssh-public-key .ssh/id_ed25519.pub

# Join an existing network
replicated vm create --distribution ubuntu --version 24.04 --ttl 2h --network <network-id> --ssh-public-key .ssh/id_ed25519.pub
```

Get `<network-id>` from `replicated vm ls` (NETWORK column) or `replicated network ls`.

## Air-Gapped Testing (Beta)

```bash
replicated vm create --distribution ubuntu --version 24.04 --ttl 2h --network-policy airgap
```
