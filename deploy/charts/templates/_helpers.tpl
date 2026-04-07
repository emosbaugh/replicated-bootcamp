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
TLS secret name resolution.
- mode=auto or self-signed: <fullname>-tls (cert-manager creates it)
- mode=manual with secretName: the provided secret name
- mode=manual with cert/key: <fullname>-tls (tls-secret.yaml creates it)
*/}}
{{- define "playball-exe.tlsSecretName" -}}
{{- if and (eq .Values.tls.mode "manual") .Values.tls.manual.secretName -}}
{{- .Values.tls.manual.secretName }}
{{- else -}}
{{- printf "%s-tls" (include "playball-exe.fullname" .) }}
{{- end -}}
{{- end }}

{{/*
TLS validation — call from every template that renders TLS resources.
Fails with a descriptive message on misconfiguration.
*/}}
{{- define "playball-exe.validateTls" -}}
{{- if .Values.tls.enabled -}}
{{- if eq .Values.tls.mode "auto" -}}
{{- if not .Values.tls.auto.issuerRef.name -}}
{{- fail "tls.auto.issuerRef.name is required when tls.mode=auto" -}}
{{- end -}}
{{- else if eq .Values.tls.mode "manual" -}}
{{- if and (not .Values.tls.manual.secretName) (not .Values.tls.manual.cert) -}}
{{- fail "tls.mode=manual requires either tls.manual.secretName or tls.manual.cert to be set" -}}
{{- end -}}
{{- if and .Values.tls.manual.secretName .Values.tls.manual.cert -}}
{{- fail "tls.manual.secretName and tls.manual.cert are mutually exclusive — use one or the other" -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
