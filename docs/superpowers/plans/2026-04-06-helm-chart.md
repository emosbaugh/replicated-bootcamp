# playball.exe Helm Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Helm chart and Dockerfile to deploy playball.exe (Next.js + PostgreSQL) on self-hosted/local Kubernetes with automatic database migrations on startup.

**Architecture:** A multi-stage Dockerfile builds a standalone Next.js image. The Helm chart deploys the app with an init container running `prisma migrate deploy`, an optional Bitnami PostgreSQL subchart (OCI), and configurable Service/Ingress exposure. When PostgreSQL is disabled, users supply `externalDatabase.url`.

**Tech Stack:** Next.js 16 standalone output, Prisma 7, Bitnami postgresql (OCI), Helm 3, node:20-alpine

---

### Task 1: Enable Next.js standalone output

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Update next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: {
    '/*': ['./src/generated/prisma/**/*', './prisma/**/*'],
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify build works**

```bash
npm run build
```

Expected: build completes, `.next/standalone/` directory is created.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: enable Next.js standalone output for Docker deployment"
```

---

### Task 2: Add .dockerignore

**Files:**
- Create: `.dockerignore`

This prevents unnecessary files from being sent to the Docker build context, which speeds up builds and prevents accidental inclusion of secrets.

- [ ] **Step 1: Create .dockerignore**

```
node_modules
.next
.git
.env
.env.*
!.env.example
deploy
docs
README.md
docker-compose.yml
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for Docker builds"
```

---

### Task 3: Write the Dockerfile

**Files:**
- Create: `deploy/Dockerfile`

The image is used for both the app container and the migration init container — so it needs both the standalone server and the Prisma CLI.

- [ ] **Step 1: Create deploy/Dockerfile**

```dockerfile
# Stage 1: install all dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: build the Next.js app
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Standalone Next.js server output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma CLI and engines needed by the migration init container
# Note: @prisma/engines contains native binaries (~100MB) required by prisma migrate
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

- [ ] **Step 2: Verify the image builds**

Run from the repo root (not from `deploy/`):

```bash
docker build -f deploy/Dockerfile -t playball-exe:local .
```

Expected: image builds and all three stages complete without error.

- [ ] **Step 3: Smoke-test the image locally**

You need a running PostgreSQL to test fully. Use the existing docker-compose for that:

```bash
docker compose up -d
```

Then run the migration init container behavior manually:

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://baseball:baseball@host.docker.internal:5432/baseball" \
  -e NEXTAUTH_SECRET="test-secret" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  --entrypoint node \
  playball-exe:local \
  node_modules/prisma/build/index.js migrate deploy
```

Expected: migrations apply and process exits 0.

Then verify the server starts:

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://baseball:baseball@host.docker.internal:5432/baseball" \
  -e NEXTAUTH_SECRET="test-secret" \
  -e NEXTAUTH_URL="http://localhost:3000" \
  playball-exe:local
```

Expected: server starts on port 3000. Visit http://localhost:3000 — should load the app.

- [ ] **Step 4: Commit**

```bash
git add deploy/Dockerfile
git commit -m "feat: add multi-stage Dockerfile for playball.exe"
```

---

### Task 4: Chart scaffolding — Chart.yaml and values.yaml

**Files:**
- Create: `deploy/charts/Chart.yaml`
- Create: `deploy/charts/values.yaml`

- [ ] **Step 1: Look up the latest Bitnami postgresql chart version**

```bash
helm show chart oci://registry-1.docker.io/bitnamicharts/postgresql 2>/dev/null | grep '^version'
```

Use the version returned in Chart.yaml below (replacing `16.4.2` if different).

- [ ] **Step 2: Create deploy/charts/Chart.yaml**

```yaml
apiVersion: v2
name: playball-exe
description: Helm chart for deploying the playball.exe baseball game
type: application
version: 0.1.0
appVersion: "latest"
dependencies:
  - name: postgresql
    version: "16.4.2"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: postgresql.enabled
```

Replace `16.4.2` with the version from Step 1 if it differs.

- [ ] **Step 3: Create deploy/charts/values.yaml**

```yaml
# Container image for the app (and migration init container)
image:
  repository: playball-exe
  tag: latest
  pullPolicy: IfNotPresent

replicaCount: 1

service:
  # ClusterIP | LoadBalancer | NodePort
  type: ClusterIP
  port: 3000

ingress:
  enabled: false
  className: ""
  hostname: ""
  # tls:
  #   - secretName: playball-exe-tls
  #     hosts:
  #       - playball.example.com
  tls: []

# Set postgresql.enabled=false and provide externalDatabase.url to use your own PostgreSQL
postgresql:
  enabled: true
  auth:
    database: baseball
    username: baseball
    # Override this in production!
    password: baseball
  primary:
    persistence:
      size: 1Gi

# Only used when postgresql.enabled=false
externalDatabase:
  url: ""

nextauth:
  # Required: generate with: openssl rand -base64 32
  secret: ""
  url: "http://localhost:3000"
```

- [ ] **Step 4: Run helm dependency update**

```bash
helm dependency update deploy/charts
```

Expected: downloads `deploy/charts/charts/postgresql-<version>.tgz` and updates `deploy/charts/Chart.lock`.

- [ ] **Step 5: Commit**

```bash
git add deploy/charts/
git commit -m "feat: scaffold Helm chart with Chart.yaml, values.yaml, and postgresql dependency"
```

---

### Task 5: Create _helpers.tpl

**Files:**
- Create: `deploy/charts/templates/_helpers.tpl`

- [ ] **Step 1: Create deploy/charts/templates/_helpers.tpl**

```
{{/*
Expand the name of the chart.
*/}}
{{- define "playball-exe.fullname" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "playball-exe.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: playball-exe
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "playball-exe.selectorLabels" -}}
app.kubernetes.io/name: playball-exe
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
The ClusterIP service name that the Bitnami postgresql subchart creates.
Bitnami names it: <release-name>-postgresql
*/}}
{{- define "playball-exe.postgresql.serviceName" -}}
{{- printf "%s-postgresql" .Release.Name }}
{{- end }}

{{/*
DATABASE_URL — constructed from subchart values when postgresql.enabled,
or passed through from externalDatabase.url.
*/}}
{{- define "playball-exe.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
{{- printf "postgresql://%s:%s@%s:5432/%s" .Values.postgresql.auth.username .Values.postgresql.auth.password (include "playball-exe.postgresql.serviceName" .) .Values.postgresql.auth.database }}
{{- else -}}
{{- .Values.externalDatabase.url }}
{{- end }}
{{- end }}
```

- [ ] **Step 2: Commit**

```bash
git add deploy/charts/templates/_helpers.tpl
git commit -m "feat: add Helm named template helpers"
```

---

### Task 6: Create secret.yaml

**Files:**
- Create: `deploy/charts/templates/secret.yaml`

- [ ] **Step 1: Create deploy/charts/templates/secret.yaml**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "playball-exe.fullname" . }}
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
type: Opaque
stringData:
  DATABASE_URL: {{ include "playball-exe.databaseUrl" . | quote }}
  NEXTAUTH_SECRET: {{ .Values.nextauth.secret | quote }}
  NEXTAUTH_URL: {{ .Values.nextauth.url | quote }}
```

- [ ] **Step 2: Commit**

```bash
git add deploy/charts/templates/secret.yaml
git commit -m "feat: add Helm secret template for app credentials"
```

---

### Task 7: Create deployment.yaml

**Files:**
- Create: `deploy/charts/templates/deployment.yaml`

The init container runs `prisma migrate deploy` before the app starts. Both the init container and app container use the same image and env vars from the Secret.

- [ ] **Step 1: Create deploy/charts/templates/deployment.yaml**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "playball-exe.fullname" . }}
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "playball-exe.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "playball-exe.selectorLabels" . | nindent 8 }}
    spec:
      initContainers:
        - name: migrate
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          command:
            - node
            - node_modules/prisma/build/index.js
            - migrate
            - deploy
          envFrom:
            - secretRef:
                name: {{ include "playball-exe.fullname" . }}
      containers:
        - name: app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          envFrom:
            - secretRef:
                name: {{ include "playball-exe.fullname" . }}
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 15
            periodSeconds: 20
```

- [ ] **Step 2: Commit**

```bash
git add deploy/charts/templates/deployment.yaml
git commit -m "feat: add Helm deployment template with migration init container"
```

---

### Task 8: Create service.yaml

**Files:**
- Create: `deploy/charts/templates/service.yaml`

- [ ] **Step 1: Create deploy/charts/templates/service.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "playball-exe.fullname" . }}
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "playball-exe.selectorLabels" . | nindent 4 }}
```

- [ ] **Step 2: Commit**

```bash
git add deploy/charts/templates/service.yaml
git commit -m "feat: add Helm service template"
```

---

### Task 9: Create ingress.yaml

**Files:**
- Create: `deploy/charts/templates/ingress.yaml`

- [ ] **Step 1: Create deploy/charts/templates/ingress.yaml**

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "playball-exe.fullname" . }}
  labels:
    {{- include "playball-exe.labels" . | nindent 4 }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- toYaml .Values.ingress.tls | nindent 4 }}
  {{- end }}
  rules:
    - host: {{ .Values.ingress.hostname | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "playball-exe.fullname" . }}
                port:
                  number: {{ .Values.service.port }}
{{- end }}
```

- [ ] **Step 2: Commit**

```bash
git add deploy/charts/templates/ingress.yaml
git commit -m "feat: add Helm ingress template"
```

---

### Task 10: Validate chart with helm lint and template render

- [ ] **Step 1: Run helm lint**

```bash
helm lint deploy/charts
```

Expected: `1 chart(s) linted, 0 chart(s) failed`

- [ ] **Step 2: Render templates and inspect output**

```bash
helm template myapp deploy/charts \
  --set nextauth.secret="test-secret" \
  --set nextauth.url="http://localhost:3000"
```

Expected: renders valid YAML for Deployment, Service, Secret. No ingress (disabled by default).

- [ ] **Step 3: Render with ingress enabled and verify**

```bash
helm template myapp deploy/charts \
  --set nextauth.secret="test-secret" \
  --set nextauth.url="http://playball.example.com" \
  --set ingress.enabled=true \
  --set ingress.hostname="playball.example.com" \
  --set service.type=ClusterIP
```

Expected: Ingress resource appears in output with correct hostname and backend pointing to the service.

- [ ] **Step 4: Render with external database and verify DATABASE_URL**

```bash
helm template myapp deploy/charts \
  --set postgresql.enabled=false \
  --set externalDatabase.url="postgresql://user:pass@my-db:5432/baseball" \
  --set nextauth.secret="test-secret" \
  --set nextauth.url="http://localhost:3000" \
  | grep DATABASE_URL
```

Expected: `DATABASE_URL` in the Secret equals `"postgresql://user:pass@my-db:5432/baseball"`.

- [ ] **Step 5: Commit**

```bash
git add deploy/charts/
git commit -m "chore: validate helm chart lints and renders correctly"
```

---

## Usage Reference

Install with bundled PostgreSQL:

```bash
helm install myapp deploy/charts \
  --set nextauth.secret="$(openssl rand -base64 32)" \
  --set nextauth.url="http://localhost:3000" \
  --set postgresql.auth.password="changeme"
```

Install with external PostgreSQL:

```bash
helm install myapp deploy/charts \
  --set postgresql.enabled=false \
  --set externalDatabase.url="postgresql://user:pass@host:5432/baseball" \
  --set nextauth.secret="$(openssl rand -base64 32)" \
  --set nextauth.url="http://myapp.example.com"
```

Upgrade after pushing a new image:

```bash
helm upgrade myapp deploy/charts --reuse-values --set image.tag="v1.2.3"
```
