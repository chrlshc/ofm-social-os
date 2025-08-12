{{/*
Expand the name of the chart.
*/}}
{{- define "ofm-social-os.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "ofm-social-os.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "ofm-social-os.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ofm-social-os.labels" -}}
helm.sh/chart: {{ include "ofm-social-os.chart" . }}
{{ include "ofm-social-os.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "ofm-social-os.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ofm-social-os.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "ofm-social-os.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "ofm-social-os.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Common environment variables
*/}}
{{- define "ofm-social-os.env" -}}
- name: NODE_ENV
  value: {{ .Values.global.environment | quote }}
- name: VERSION
  value: {{ .Chart.AppVersion | quote }}
- name: RELEASE_NAME
  value: {{ .Release.Name | quote }}
- name: NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
- name: POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: POD_IP
  valueFrom:
    fieldRef:
      fieldPath: status.podIP
{{- range $key, $value := .Values.env }}
- name: {{ $key }}
  value: {{ $value | quote }}
{{- end }}
{{- end }}

{{/*
Security context for containers
*/}}
{{- define "ofm-social-os.securityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
capabilities:
  drop:
    - ALL
readOnlyRootFilesystem: true
allowPrivilegeEscalation: false
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/*
Pod security context
*/}}
{{- define "ofm-social-os.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/*
Common volume mounts for all containers
*/}}
{{- define "ofm-social-os.volumeMounts" -}}
- name: tmp
  mountPath: /tmp
- name: cache
  mountPath: /app/.cache
- name: logs
  mountPath: /app/logs
{{- end }}

{{/*
Common volumes for all pods
*/}}
{{- define "ofm-social-os.volumes" -}}
- name: tmp
  emptyDir:
    sizeLimit: 1Gi
- name: cache
  emptyDir:
    sizeLimit: 2Gi
- name: logs
  emptyDir:
    sizeLimit: 1Gi
{{- end }}

{{/*
Resource limits and requests
*/}}
{{- define "ofm-social-os.resources" -}}
{{- if .resources }}
resources:
  {{- if .resources.limits }}
  limits:
    {{- if .resources.limits.cpu }}
    cpu: {{ .resources.limits.cpu }}
    {{- end }}
    {{- if .resources.limits.memory }}
    memory: {{ .resources.limits.memory }}
    {{- end }}
  {{- end }}
  {{- if .resources.requests }}
  requests:
    {{- if .resources.requests.cpu }}
    cpu: {{ .resources.requests.cpu }}
    {{- end }}
    {{- if .resources.requests.memory }}
    memory: {{ .resources.requests.memory }}
    {{- end }}
  {{- end }}
{{- end }}
{{- end }}

{{/*
Probe configuration
*/}}
{{- define "ofm-social-os.livenessProbe" -}}
httpGet:
  path: /health
  port: http
  scheme: HTTP
initialDelaySeconds: {{ .initialDelaySeconds | default 30 }}
periodSeconds: {{ .periodSeconds | default 10 }}
timeoutSeconds: {{ .timeoutSeconds | default 5 }}
failureThreshold: {{ .failureThreshold | default 3 }}
successThreshold: {{ .successThreshold | default 1 }}
{{- end }}

{{- define "ofm-social-os.readinessProbe" -}}
httpGet:
  path: /health
  port: http
  scheme: HTTP
initialDelaySeconds: {{ .initialDelaySeconds | default 5 }}
periodSeconds: {{ .periodSeconds | default 5 }}
timeoutSeconds: {{ .timeoutSeconds | default 3 }}
failureThreshold: {{ .failureThreshold | default 3 }}
successThreshold: {{ .successThreshold | default 1 }}
{{- end }}

{{- define "ofm-social-os.startupProbe" -}}
httpGet:
  path: /health
  port: http
  scheme: HTTP
initialDelaySeconds: {{ .initialDelaySeconds | default 10 }}
periodSeconds: {{ .periodSeconds | default 5 }}
timeoutSeconds: {{ .timeoutSeconds | default 3 }}
failureThreshold: {{ .failureThreshold | default 30 }}
successThreshold: {{ .successThreshold | default 1 }}
{{- end }}

{{/*
Canary deployment labels
*/}}
{{- define "ofm-social-os.canaryLabels" -}}
{{ include "ofm-social-os.labels" . }}
version: canary
deployment.argoproj.io/instance: {{ include "ofm-social-os.fullname" . }}-canary
{{- end }}

{{/*
Stable deployment labels
*/}}
{{- define "ofm-social-os.stableLabels" -}}
{{ include "ofm-social-os.labels" . }}
version: stable
deployment.argoproj.io/instance: {{ include "ofm-social-os.fullname" . }}-stable
{{- end }}

{{/*
Database connection string
*/}}
{{- define "ofm-social-os.databaseUrl" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "postgresql://%s:%s@%s-postgresql:%d/%s" .Values.postgresql.auth.username .Values.postgresql.auth.postgresPassword (include "ofm-social-os.fullname" .) .Values.postgresql.primary.service.ports.postgresql .Values.postgresql.auth.database }}
{{- else }}
{{- .Values.env.DATABASE_URL }}
{{- end }}
{{- end }}

{{/*
Redis connection string
*/}}
{{- define "ofm-social-os.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- if .Values.redis.auth.enabled }}
{{- printf "redis://:%s@%s-redis-master:%d" .Values.redis.auth.password (include "ofm-social-os.fullname" .) .Values.redis.master.service.ports.redis }}
{{- else }}
{{- printf "redis://%s-redis-master:%d" (include "ofm-social-os.fullname" .) .Values.redis.master.service.ports.redis }}
{{- end }}
{{- else }}
{{- .Values.env.REDIS_URL }}
{{- end }}
{{- end }}

{{/*
Feature flags configuration
*/}}
{{- define "ofm-social-os.featureFlags" -}}
{{- .Values.featureFlags | toJson }}
{{- end }}

{{/*
Monitoring annotations
*/}}
{{- define "ofm-social-os.monitoringAnnotations" -}}
prometheus.io/scrape: "true"
prometheus.io/port: "9090"
prometheus.io/path: "/metrics"
{{- end }}

{{/*
Network policy selectors
*/}}
{{- define "ofm-social-os.networkPolicySelector" -}}
matchLabels:
  {{- include "ofm-social-os.selectorLabels" . | nindent 2 }}
{{- end }}