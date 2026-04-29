include deploy/versions.env

CHART_VERSION ?= 0.1.0-dev
IMAGE_TAG ?= main

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

.PHONY: helm-lint
helm-lint: package-charts
	helm lint deploy/build/charts --set nextauth.secret=test
	helm lint deploy/build/charts \
	  --set nextauth.secret=test \
	  --set nextauth.url=https://example.com \
	  --set ingress.enabled=true \
	  --set ingress.hostname=example.com \
	  --set ingress.className=traefik

.PHONY: replicated-lint
replicated-lint: package-charts
	replicated release lint

.PHONY: lint
lint: helm-lint replicated-lint

.PHONY: package-charts
package-charts:
	./deploy/scripts/package-charts.sh $(CHART_VERSION) $(IMAGE_TAG)

.PHONY: dev-setup
dev-setup:
	./scripts/dev-setup.sh

.PHONY: dev-run
dev-run:
	./scripts/dev-run.sh
