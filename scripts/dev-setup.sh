#!/usr/bin/env bash
set -euo pipefail

# dev-setup.sh — one-time setup for the local k3d dev environment.
# Usage: REPLICATED_LICENSE_ID=<id> ./scripts/dev-setup.sh

: "${REPLICATED_LICENSE_ID:?Set REPLICATED_LICENSE_ID before running this script}"

if k3d cluster list | grep -q playball-dev; then
  echo "==> Cluster 'playball-dev' already exists — skipping create"
else
  echo "==> Creating k3d cluster..."
  k3d cluster create playball-dev
  echo "==> Waiting for node to be ready..."
  kubectl wait --for=condition=Ready node --all --timeout=60s
fi

echo "==> Generating image pull secret..."
DOCKER_CONFIG=$(echo -n "{\"auths\":{\"images.emosbaugh.be\":{\"auth\":\"$(echo -n "${REPLICATED_LICENSE_ID}:${REPLICATED_LICENSE_ID}" | base64)\"}}}" | base64)

echo "==> Installing Helm chart (postgres, redis, Replicated SDK only)..."
helm upgrade --install playball deploy/charts \
  -f deploy/charts/values.dev.yaml \
  --set replicated.integration.licenseID="${REPLICATED_LICENSE_ID}" \
  --set global.replicated.dockerconfigjson="${DOCKER_CONFIG}" \
  --wait --timeout 5m

echo "==> Verifying pods..."
kubectl get pods

echo "==> Configuring .env.local..."
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  SECRET=$(openssl rand -base64 32)
  sed -i.bak "s|generate-with-openssl-rand-base64-32|${SECRET}|" .env.local
  rm .env.local.bak
  echo "    Created .env.local with a generated NEXTAUTH_SECRET"
else
  echo "    .env.local already exists — skipping"
fi

echo "==> Running database migrations and seed..."
npx prisma generate
npx prisma migrate dev
npx prisma db seed

echo ""
echo "Setup complete. Run ./scripts/dev-run.sh to start the dev server."
