# Testing with CMX

Use the [Replicated Compatibility Matrix (CMX)](https://docs.replicated.com/vendor/testing-about) to spin up on-demand Kubernetes clusters and test the Helm chart end-to-end.

## Prerequisites

- `replicated` CLI installed and authenticated
- `REPLICATED_API_TOKEN` set in your environment
- `helm` and `kubectl` installed

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
export KUBECONFIG=$(replicated cluster kubeconfig <cluster-id> --output-path /tmp/kubeconfig-playball)
kubectl get nodes
```

## Install the Helm Chart

```bash
helm install playball deploy/charts \
  --set nextauth.secret="$(openssl rand -base64 32)" \
  --set service.type=NodePort \
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
