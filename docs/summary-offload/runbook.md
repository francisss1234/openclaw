# Summary Offload Runbook

## Rollout

1. Deploy summary service and Redis queue.
2. Enable `agents.defaults.compaction.summaryOffload.enabled=true`.
3. Verify `/metrics` on gateway and summary service.
4. Monitor p95 chat latency and summary success rate.

## Rollback

1. Set `agents.defaults.compaction.summaryOffload.enabled=false`.
2. Restart gateway.
3. Keep summary service running for postmortem if needed.

## Alerts

- Chat latency p95 > 300 ms for 10 minutes.
- Summary duration p99 > 0.8 s for 10 minutes.
- Summary success rate < 99 % over 10 minutes.
- Redis stream lag > 500 pending messages.
