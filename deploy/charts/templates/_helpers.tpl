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
