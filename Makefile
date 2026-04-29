include deploy/versions.env

CHART_VERSION ?= 0.1.0-dev
IMAGE_TAG ?= main

.PHONY: docker-build helm-lint replicated-lint lint package-charts dev-setup dev-run

docker-build:
	docker build -f deploy/Dockerfile \
	  --build-arg SUPPORT_BUNDLE_VERSION=$(SUPPORT_BUNDLE_VERSION) \
	  .

deploy/.build-charts:
	./deploy/scripts/package-charts.sh $(CHART_VERSION) $(IMAGE_TAG)

helm-lint: deploy/.build-charts
	helm lint deploy/.build-charts --set nextauth.secret=test
	helm lint deploy/.build-charts \
	  --set nextauth.secret=test \
	  --set nextauth.url=https://example.com \
	  --set ingress.enabled=true \
	  --set ingress.hostname=example.com \
	  --set ingress.className=traefik

replicated-lint:
	replicated release lint

lint: helm-lint replicated-lint

package-charts:
	./deploy/scripts/package-charts.sh $(CHART_VERSION) $(IMAGE_TAG)

dev-setup:
	./scripts/dev-setup.sh

dev-run:
	./scripts/dev-run.sh
