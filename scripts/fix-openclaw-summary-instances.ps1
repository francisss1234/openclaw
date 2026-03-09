param(
  [string]$ConfigPath
)

if (-not $ConfigPath) {
  if ($env:OPENCLAW_CONFIG_PATH) {
    $ConfigPath = $env:OPENCLAW_CONFIG_PATH
  } else {
    $ConfigPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"
  }
}

if (-not (Test-Path $ConfigPath)) {
  throw "Missing config file: $ConfigPath"
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

if (-not $config.gateway) {
  throw "Missing gateway config"
}
if (-not $config.gateway.summaryService) {
  throw "Missing gateway.summaryService config"
}
if (-not $config.gateway.summaryService.instances) {
  throw "Missing gateway.summaryService.instances"
}

$instances = $config.gateway.summaryService.instances
if (-not ($instances -is [System.Collections.IEnumerable])) {
  throw "gateway.summaryService.instances must be an array"
}

foreach ($instance in $instances) {
  if ($instance.base_url -and -not $instance.baseUrl) {
    $instance | Add-Member -NotePropertyName "baseUrl" -NotePropertyValue $instance.base_url -Force
  }
  if ($instance.api_key -and -not $instance.apiKey) {
    $instance | Add-Member -NotePropertyName "apiKey" -NotePropertyValue $instance.api_key -Force
  }
  if ($instance.consumer_name -and -not $instance.consumerName) {
    $instance | Add-Member -NotePropertyName "consumerName" -NotePropertyValue $instance.consumer_name -Force
  }
  $instance.PSObject.Properties.Remove("base_url")
  $instance.PSObject.Properties.Remove("api_key")
  $instance.PSObject.Properties.Remove("consumer_name")
}

$config | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $ConfigPath
