#!/usr/bin/env bash
set -euo pipefail

CHART_VERSION="${1:?Usage: package-charts.sh <chart-version> [image-tag]}"
IMAGE_TAG="${2:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=../versions.env
source "$REPO_ROOT/deploy/versions.env"

BUILD_DIR="$REPO_ROOT/deploy/.build"
CHARTS_WORK_DIR="$BUILD_DIR/charts"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$CHARTS_WORK_DIR"

# Copy manifests into build dir — we stamp versions on these copies, not the originals
cp "$REPO_ROOT"/deploy/manifests/*.yaml "$BUILD_DIR/"

# Copy chart source into build working dir
cp -r "$REPO_ROOT/deploy/charts/." "$CHARTS_WORK_DIR/"

# Stamp Chart.yaml dependency versions
yq -i "(.dependencies[] | select(.name == \"postgresql\") | .version) = \"${POSTGRESQL_CHART_VERSION}\"" \
  "$CHARTS_WORK_DIR/Chart.yaml"
yq -i "(.dependencies[] | select(.name == \"redis\") | .version) = \"${REDIS_CHART_VERSION}\"" \
  "$CHARTS_WORK_DIR/Chart.yaml"
yq -i "(.dependencies[] | select(.name == \"replicated\") | .version) = \"${REPLICATED_CHART_VERSION}\"" \
  "$CHARTS_WORK_DIR/Chart.yaml"

# Stamp embedded-cluster-config.yaml versions
yq -i ".spec.version = \"${EMBEDDED_CLUSTER_VERSION}\"" \
  "$BUILD_DIR/embedded-cluster-config.yaml"
yq -i "(.spec.extensions.helmCharts[] | select(.chart.name == \"cert-manager\") | .chart.chartVersion) = \"${CERT_MANAGER_CHART_VERSION}\"" \
  "$BUILD_DIR/embedded-cluster-config.yaml"
yq -i "(.spec.extensions.helmCharts[] | select(.chart.name == \"traefik\") | .chart.chartVersion) = \"${TRAEFIK_CHART_VERSION}\"" \
  "$BUILD_DIR/embedded-cluster-config.yaml"

# Stamp helmchart.yaml with the release chart version
yq -i ".spec.chart.chartVersion = \"${CHART_VERSION}\"" "$BUILD_DIR/helmchart.yaml"

# Stamp image tag into chart values if provided
if [[ -n "$IMAGE_TAG" ]]; then
  yq -i ".image.tag = \"${IMAGE_TAG}\"" "$CHARTS_WORK_DIR/values.yaml"
fi

helm dependency update "$CHARTS_WORK_DIR"
helm package "$CHARTS_WORK_DIR" -d "$BUILD_DIR" --version "$CHART_VERSION"

helm repo add traefik https://helm.traefik.io/traefik
helm pull traefik/traefik --version "$TRAEFIK_CHART_VERSION" -d "$BUILD_DIR"

helm repo add jetstack https://charts.jetstack.io
helm pull jetstack/cert-manager --version "$CERT_MANAGER_CHART_VERSION" -d "$BUILD_DIR"
