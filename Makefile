include deploy/versions.env

.PHONY: all
all: test lint

.PHONY: test
test:
	npm test

.PHONY: docker-build
docker-build:
	docker build -f deploy/Dockerfile \
	  --build-arg SUPPORT_BUNDLE_VERSION=$(SUPPORT_BUNDLE_VERSION) \
	  .

.PHONY: helm-dep-update
helm-dep-update:
	helm dependency update deploy/charts

.PHONY: helm-lint
helm-lint: helm-dep-update
	helm lint deploy/charts --set nextauth.secret=test
	helm lint deploy/charts \
	  --set nextauth.secret=test \
	  --set nextauth.url=https://example.com \
	  --set ingress.enabled=true \
	  --set ingress.hostname=example.com \
	  --set ingress.className=traefik

.PHONY: replicated-lint
replicated-lint: helm-dep-update
	replicated release lint

.PHONY: lint
lint: helm-lint replicated-lint

VERSION ?= 0.1.0
IMAGE_TAG ?= main

.PHONY: package-charts
package-charts:
	perl -i -pe 's/^version: .*/version: $(VERSION)/' deploy/charts/Chart.yaml
	perl -i -pe 's/^    chartVersion: .*/    chartVersion: $(VERSION)/' deploy/manifests/helmchart.yaml
	perl -i -pe 's/^  tag: .*/  tag: $(IMAGE_TAG)/' deploy/charts/values.yaml

.PHONY: dev-setup
dev-setup:
	./scripts/dev-setup.sh

.PHONY: dev-run
dev-run:
	./scripts/dev-run.sh
