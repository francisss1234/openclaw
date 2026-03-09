param(
  [string]$ApiKey,
  [string]$BaseUrl = "https://integrate.api.nvidia.com/v1",
  [string]$Model = "z-ai/glm5",
  [string]$ConfigPath
)

if (-not $ConfigPath) {
  if ($env:OPENCLAW_CONFIG_PATH) {
    $ConfigPath = $env:OPENCLAW_CONFIG_PATH
  } else {
    $ConfigPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"
  }
}

if (-not $ApiKey) {
  throw "ApiKey is required"
}

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
$summaryService | Add-Member -NotePropertyName "baseUrl" -NotePropertyValue $BaseUrl -Force
$summaryService | Add-Member -NotePropertyName "apiKey" -NotePropertyValue $ApiKey -Force
$summaryService | Add-Member -NotePropertyName "model" -NotePropertyValue $Model -Force

$config | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $ConfigPath
