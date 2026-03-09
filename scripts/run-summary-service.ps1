param(
  [string]$ConfigPath = ".local/summary-service.config.json"
)

if (-not (Test-Path $ConfigPath)) {
  throw "Missing config file: $ConfigPath"
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

if ($null -eq $config.base_url -or $null -eq $config.api_key -or $null -eq $config.model) {
  throw "Config must include base_url, api_key, model"
}

$env:SUMMARY_BASE_URL = $config.base_url
$env:SUMMARY_API_KEY = $config.api_key
$env:SUMMARY_MODEL = $config.model

if ($null -ne $config.redis_url) {
  $env:SUMMARY_REDIS_URL = $config.redis_url
}
if ($null -ne $config.job_stream) {
  $env:SUMMARY_JOB_STREAM = $config.job_stream
}
if ($null -ne $config.result_stream) {
  $env:SUMMARY_RESULT_STREAM = $config.result_stream
}
if ($null -ne $config.consumer_group) {
  $env:SUMMARY_CONSUMER_GROUP = $config.consumer_group
}
if ($null -ne $config.consumer_name) {
  $env:SUMMARY_CONSUMER_NAME = $config.consumer_name
}
if ($null -ne $config.port) {
  $env:SUMMARY_PORT = "$($config.port)"
}
if ($null -ne $config.claim_idle_ms) {
  $env:SUMMARY_CLAIM_IDLE_MS = "$($config.claim_idle_ms)"
}

pnpm --filter @openclaw/summary-service start
