import client from "prom-client";

const registry = new client.Registry();

client.collectDefaultMetrics({ register: registry });

const summaryDurationSeconds = new client.Summary({
  name: "openclaw_summary_duration_seconds",
  help: "Summary service duration in seconds",
  percentiles: [0.5, 0.9, 0.99],
  registers: [registry],
});

const chatDelaySeconds = new client.Summary({
  name: "openclaw_chat_delay_seconds",
  help: "Chat delay seconds by reason",
  percentiles: [0.5, 0.9, 0.99],
  labelNames: ["reason"],
  registers: [registry],
});

export function observeSummaryDurationSeconds(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    return;
  }
  summaryDurationSeconds.observe(value);
}

export function observeChatDelaySeconds(params: { reason: string; value: number }): void {
  if (!Number.isFinite(params.value) || params.value < 0) {
    return;
  }
  chatDelaySeconds.labels(params.reason).observe(params.value);
}

export async function getMetricsSnapshot(): Promise<string> {
  return registry.metrics();
}
