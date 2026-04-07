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
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
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

WARNING: The postgresql password is interpolated directly into the URL string.
Never commit rendered Helm manifests (helm template output) to version control,
as they will contain the password in plaintext.
*/}}
{{- define "playball-exe.databaseUrl" -}}
{{- if .Values.postgresql.enabled -}}
{{- printf "postgresql://%s:%s@%s:5432/%s" .Values.postgresql.auth.username .Values.postgresql.auth.password (include "playball-exe.postgresql.serviceName" .) .Values.postgresql.auth.database }}
{{- else -}}
{{- required "externalDatabase.url is required when postgresql.enabled=false" .Values.externalDatabase.url }}
{{- end }}
{{- end }}

{{/*
The ClusterIP service name that the Bitnami redis subchart creates.
Bitnami names it: <release-name>-redis-master
*/}}
{{- define "playball-exe.redis.serviceName" -}}
{{- printf "%s-redis-master" .Release.Name }}
{{- end }}

{{/*
REDIS_URL — constructed from subchart values when redis.enabled,
or passed through from externalRedis.url.
*/}}
{{- define "playball-exe.redisUrl" -}}
{{- if .Values.redis.enabled -}}
{{- printf "redis://%s:6379" (include "playball-exe.redis.serviceName" .) }}
{{- else -}}
{{- required "externalRedis.url is required when redis.enabled=false" .Values.externalRedis.url }}
{{- end }}
{{- end }}
