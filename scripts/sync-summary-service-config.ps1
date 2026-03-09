param(
  [string]$LocalConfigPath = ".local/summary-service.config.json",
  [string]$ConfigPath
)

if (-not $ConfigPath) {
  if ($env:OPENCLAW_CONFIG_PATH) {
    $ConfigPath = $env:OPENCLAW_CONFIG_PATH
  } else {
    $ConfigPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"
  }
}

if (-not (Test-Path $LocalConfigPath)) {
  throw "Missing local config: $LocalConfigPath"
}

$local = Get-Content $LocalConfigPath -Raw | ConvertFrom-Json

$configDir = Split-Path $ConfigPath -Parent
if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$config = @{}
if (Test-Path $ConfigPath) {
  $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
}

if (-not $config.gateway) {
  $config | Add-Member -NotePropertyName "gateway" -NotePropertyValue ([pscustomobject]@{})
}

$gateway = $config.gateway
if (-not $gateway.summaryService) {
  $gateway | Add-Member -NotePropertyName "summaryService" -NotePropertyValue ([pscustomobject]@{})
}

$summaryService = $gateway.summaryService
$summaryService | Add-Member -NotePropertyName "enabled" -NotePropertyValue $true -Force

if ($local.instances) {
  $instances = @()
  foreach ($entry in $local.instances) {
    $instance = [pscustomobject]@{}
    if ($entry.base_url) { $instance | Add-Member -NotePropertyName "baseUrl" -NotePropertyValue $entry.base_url -Force }
    if ($entry.baseUrl) { $instance | Add-Member -NotePropertyName "baseUrl" -NotePropertyValue $entry.baseUrl -Force }
    if ($entry.api_key) { $instance | Add-Member -NotePropertyName "apiKey" -NotePropertyValue $entry.api_key -Force }
    if ($entry.apiKey) { $instance | Add-Member -NotePropertyName "apiKey" -NotePropertyValue $entry.apiKey -Force }
    if ($entry.model) { $instance | Add-Member -NotePropertyName "model" -NotePropertyValue $entry.model -Force }
    if ($entry.redis_url) { $instance | Add-Member -NotePropertyName "redisUrl" -NotePropertyValue $entry.redis_url -Force }
    if ($entry.redisUrl) { $instance | Add-Member -NotePropertyName "redisUrl" -NotePropertyValue $entry.redisUrl -Force }
    if ($entry.job_stream) { $instance | Add-Member -NotePropertyName "jobStream" -NotePropertyValue $entry.job_stream -Force }
    if ($entry.jobStream) { $instance | Add-Member -NotePropertyName "jobStream" -NotePropertyValue $entry.jobStream -Force }
    if ($entry.result_stream) { $instance | Add-Member -NotePropertyName "resultStream" -NotePropertyValue $entry.result_stream -Force }
    if ($entry.resultStream) { $instance | Add-Member -NotePropertyName "resultStream" -NotePropertyValue $entry.resultStream -Force }
    if ($entry.consumer_group) { $instance | Add-Member -NotePropertyName "consumerGroup" -NotePropertyValue $entry.consumer_group -Force }
    if ($entry.consumerGroup) { $instance | Add-Member -NotePropertyName "consumerGroup" -NotePropertyValue $entry.consumerGroup -Force }
    if ($entry.consumer_name) { $instance | Add-Member -NotePropertyName "consumerName" -NotePropertyValue $entry.consumer_name -Force }
    if ($entry.consumerName) { $instance | Add-Member -NotePropertyName "consumerName" -NotePropertyValue $entry.consumerName -Force }
    if ($entry.port) { $instance | Add-Member -NotePropertyName "port" -NotePropertyValue $entry.port -Force }
    if ($entry.claim_idle_ms) { $instance | Add-Member -NotePropertyName "claimIdleMs" -NotePropertyValue $entry.claim_idle_ms -Force }
    if ($entry.claimIdleMs) { $instance | Add-Member -NotePropertyName "claimIdleMs" -NotePropertyValue $entry.claimIdleMs -Force }
    $instances += $instance
  }
  $summaryService | Add-Member -NotePropertyName "instances" -NotePropertyValue $instances -Force
}

if ($local.base_url) {
  $summaryService | Add-Member -NotePropertyName "baseUrl" -NotePropertyValue $local.base_url -Force
} elseif ($local.baseUrl) {
  $summaryService | Add-Member -NotePropertyName "baseUrl" -NotePropertyValue $local.baseUrl -Force
}
if ($local.api_key) {
  $summaryService | Add-Member -NotePropertyName "apiKey" -NotePropertyValue $local.api_key -Force
} elseif ($local.apiKey) {
  $summaryService | Add-Member -NotePropertyName "apiKey" -NotePropertyValue $local.apiKey -Force
}
if ($local.model) {
  $summaryService | Add-Member -NotePropertyName "model" -NotePropertyValue $local.model -Force
}
if ($local.redis_url) {
  $summaryService | Add-Member -NotePropertyName "redisUrl" -NotePropertyValue $local.redis_url -Force
} elseif ($local.redisUrl) {
  $summaryService | Add-Member -NotePropertyName "redisUrl" -NotePropertyValue $local.redisUrl -Force
}
if ($local.job_stream) {
  $summaryService | Add-Member -NotePropertyName "jobStream" -NotePropertyValue $local.job_stream -Force
} elseif ($local.jobStream) {
  $summaryService | Add-Member -NotePropertyName "jobStream" -NotePropertyValue $local.jobStream -Force
}
if ($local.result_stream) {
  $summaryService | Add-Member -NotePropertyName "resultStream" -NotePropertyValue $local.result_stream -Force
} elseif ($local.resultStream) {
  $summaryService | Add-Member -NotePropertyName "resultStream" -NotePropertyValue $local.resultStream -Force
}
if ($local.consumer_group) {
  $summaryService | Add-Member -NotePropertyName "consumerGroup" -NotePropertyValue $local.consumer_group -Force
} elseif ($local.consumerGroup) {
  $summaryService | Add-Member -NotePropertyName "consumerGroup" -NotePropertyValue $local.consumerGroup -Force
}
if ($local.consumer_name) {
  $summaryService | Add-Member -NotePropertyName "consumerName" -NotePropertyValue $local.consumer_name -Force
} elseif ($local.consumerName) {
  $summaryService | Add-Member -NotePropertyName "consumerName" -NotePropertyValue $local.consumerName -Force
}
if ($local.port) {
  $summaryService | Add-Member -NotePropertyName "port" -NotePropertyValue $local.port -Force
}
if ($local.claim_idle_ms) {
  $summaryService | Add-Member -NotePropertyName "claimIdleMs" -NotePropertyValue $local.claim_idle_ms -Force
} elseif ($local.claimIdleMs) {
  $summaryService | Add-Member -NotePropertyName "claimIdleMs" -NotePropertyValue $local.claimIdleMs -Force
}

$config | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $ConfigPath
