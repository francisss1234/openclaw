# Summary Service

## Run

```
SUMMARY_API_KEY="key"
SUMMARY_BASE_URL="https://api.z.ai/v1"
SUMMARY_MODEL="glm-5-chat"
SUMMARY_REDIS_URL="redis://127.0.0.1:6379"
SUMMARY_CLAIM_IDLE_MS="60000"
node --import tsx src/index.ts
```

## Local Config

Create `.local/summary-service.config.json` based on `summary-service.config.example.json`:

```
{
  "instances": [
    {
      "base_url": "https://integrate.api.nvidia.com/v1",
      "api_key": "REPLACE_WITH_API_KEY_1",
      "model": "z-ai/glm5"
    },
    {
      "base_url": "https://integrate.api.nvidia.com/v1",
      "api_key": "REPLACE_WITH_API_KEY_2",
      "model": "z-ai/glm5"
    }
  ],
  "redis_url": "redis://127.0.0.1:6379",
  "claim_idle_ms": 60000
}
```

Run:

```
pwsh scripts/run-summary-service.ps1
```

## Gateway Auto Start

```
openclaw gateway run --summary-service --summary-service-config .local/summary-service.config.json
```

## openclaw.json 配置

```
{
  "gateway": {
    "summaryService": {
      "enabled": true,
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "apiKey": "REPLACE_WITH_API_KEY",
      "model": "z-ai/glm5",
      "redisUrl": "redis://127.0.0.1:6379",
      "claimIdleMs": 60000
    }
  }
}
```

## 多模型并行摘要

```
{
  "gateway": {
    "summaryService": {
      "enabled": true,
      "instances": [
        {
          "baseUrl": "https://integrate.api.nvidia.com/v1",
          "apiKey": "REPLACE_WITH_API_KEY_1",
          "model": "z-ai/glm5"
        },
        {
          "baseUrl": "https://integrate.api.nvidia.com/v1",
          "apiKey": "REPLACE_WITH_API_KEY_2",
          "model": "z-ai/glm5"
        }
      ],
      "redisUrl": "redis://127.0.0.1:6379",
      "claimIdleMs": 60000
    }
  }
}
```

## 从 .local 同步到 openclaw.json

```
pwsh scripts/sync-summary-service-config.ps1
```

## Endpoints

- `GET /health`
- `GET /metrics`
