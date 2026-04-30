#!/usr/bin/env bash
set -euo pipefail

CHART_VERSION="${1:?Usage: package-charts.sh <chart-version> [image-tag]}"
IMAGE_TAG="${2:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

EC_MANIFEST="$REPO_ROOT/deploy/manifests/embedded-cluster-config.yaml"

# Release artifacts (yamls + tgz) — consumed by `replicated release create`
BUILD_DIR="$REPO_ROOT/deploy/build/manifests"
# Chart working copy with real versions and downloaded deps — consumed by `helm lint`
CHARTS_DIR="$REPO_ROOT/deploy/build/charts"

rm -rf "$BUILD_DIR" "$CHARTS_DIR"
mkdir -p "$BUILD_DIR" "$CHARTS_DIR"

cp "$REPO_ROOT"/deploy/manifests/*.yaml "$BUILD_DIR/"

# Copy chart source into charts working dir
cp -r "$REPO_ROOT/deploy/charts/." "$CHARTS_DIR/"

# Stamp helmchart.yaml with the release chart version
yq -i ".spec.chart.chartVersion = \"${CHART_VERSION}\"" "$BUILD_DIR/helmchart.yaml"

# Stamp Chart.yaml version to match so validators see consistent versions
yq -i ".version = \"${CHART_VERSION}\"" "$CHARTS_DIR/Chart.yaml"

# Stamp image tag into chart values if provided
if [[ -n "$IMAGE_TAG" ]]; then
  yq -i ".image.tag = \"${IMAGE_TAG}\"" "$CHARTS_DIR/values.yaml"
fi

helm dependency update "$CHARTS_DIR"
helm package "$CHARTS_DIR" -d "$BUILD_DIR" --version "$CHART_VERSION"

TRAEFIK_CHART_VERSION=$(yq '.spec.extensions.helmCharts[] | select(.chart.name == "traefik") | .chart.chartVersion' "$EC_MANIFEST")
helm repo add traefik https://helm.traefik.io/traefik
helm pull traefik/traefik --version "$TRAEFIK_CHART_VERSION" -d "$BUILD_DIR"

CERT_MANAGER_CHART_VERSION=$(yq '.spec.extensions.helmCharts[] | select(.chart.name == "cert-manager") | .chart.chartVersion' "$EC_MANIFEST")
helm repo add jetstack https://charts.jetstack.io
helm pull jetstack/cert-manager --version "$CERT_MANAGER_CHART_VERSION" -d "$BUILD_DIR"
