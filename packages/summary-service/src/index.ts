import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import OpenAI from "openai";
import client from "prom-client";
import { createClient } from "redis";
import { buildSummaryPrompt } from "../../../src/agents/summary-offload/prompt.js";
import type {
  SummaryOffloadJob,
  SummaryOffloadResult,
} from "../../../src/agents/summary-offload/types.js";

type ClaimMessage = { id: string; message: { payload?: unknown } };
type ClaimResponse = { nextId?: string; messages?: ClaimMessage[] };

const redisUrl = process.env.SUMMARY_REDIS_URL ?? "redis://127.0.0.1:6379";
const jobStream = process.env.SUMMARY_JOB_STREAM ?? "openclaw:summary:jobs";
const resultStream = process.env.SUMMARY_RESULT_STREAM ?? "openclaw:summary:results";
const consumerGroup = process.env.SUMMARY_CONSUMER_GROUP ?? "openclaw-summary-jobs";
const consumerName = process.env.SUMMARY_CONSUMER_NAME ?? `summary-${process.pid}`;
const apiKey = process.env.SUMMARY_API_KEY ?? "";
const baseUrl = process.env.SUMMARY_BASE_URL ?? "https://api.z.ai/v1";
const model = process.env.SUMMARY_MODEL ?? "glm-5-chat";
const port = Number.parseInt(process.env.SUMMARY_PORT ?? "9921", 10);
const summaryCharLimit = Number.parseInt(process.env.SUMMARY_CHAR_LIMIT ?? "400", 10);
const timeoutMs = Number.parseInt(process.env.SUMMARY_TIMEOUT_MS ?? "5000", 10);
const logSampleRate = Number.parseFloat(process.env.SUMMARY_LOG_SAMPLE_RATE ?? "0.1");
const maxChunkTokens = Number.parseInt(process.env.SUMMARY_MAX_CHUNK_TOKENS ?? "12000", 10);
const splitThresholdTokens = Number.parseInt(process.env.SUMMARY_SPLIT_TOKENS ?? "16000", 10);
const claimIdleMs = Number.parseInt(process.env.SUMMARY_CLAIM_IDLE_MS ?? "60000", 10);

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const summaryDurationSeconds = new client.Summary({
  name: "openclaw_summary_duration_seconds",
  help: "Summary service duration in seconds",
  percentiles: [0.5, 0.9, 0.99],
  registers: [registry],
});

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitByTokens(text: string, maxTokens: number): string[] {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let current: string[] = [];
  let tokens = 0;
  for (const line of lines) {
    const nextTokens = estimateTokens(line);
    if (tokens + nextTokens > maxTokens && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
      tokens = 0;
    }
    current.push(line);
    tokens += nextTokens;
  }
  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }
  return chunks;
}

function extractJsonSummary(text: string): string {
  const raw = text.trim();
  try {
    const parsed = JSON.parse(raw) as { summary?: string };
    if (typeof parsed.summary === "string") {
      return parsed.summary;
    }
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as { summary?: string };
        if (typeof parsed.summary === "string") {
          return parsed.summary;
        }
      } catch {
        return raw;
      }
    }
  }
  return raw;
}

async function summarizeChunk(params: {
  client: OpenAI;
  historyText: string;
  previousSummary?: string;
  customInstructions?: string;
  splitTurn?: boolean;
  prefixText?: string;
  summaryCharLimit: number;
  requestTimeoutMs: number;
}): Promise<{ summary: string; usage?: { input?: number; output?: number; total?: number } }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.requestTimeoutMs);
  try {
    const response = await params.client.chat.completions.create(
      {
        model,
        messages: buildSummaryPrompt({
          historyText: params.historyText,
          previousSummary: params.previousSummary,
          customInstructions: params.customInstructions,
          splitTurn: params.splitTurn,
          prefixText: params.prefixText,
          summaryCharLimit: params.summaryCharLimit,
        }),
        temperature: 0.2,
        max_tokens: 512,
      },
      { signal: controller.signal },
    );
    const content = response.choices[0]?.message?.content ?? "";
    const summary = extractJsonSummary(content).slice(0, params.summaryCharLimit);
    return {
      summary,
      usage: response.usage
        ? {
            input: response.usage.prompt_tokens,
            output: response.usage.completion_tokens,
            total: response.usage.total_tokens,
          }
        : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function summarizeHistory(params: {
  client: OpenAI;
  historyText: string;
  prefixText?: string;
  previousSummary?: string;
  customInstructions?: string;
  splitTurn: boolean;
  summaryCharLimit: number;
  requestTimeoutMs: number;
}): Promise<{ summary: string; usage?: { input?: number; output?: number; total?: number } }> {
  const tokens = estimateTokens(params.historyText);
  if (tokens <= splitThresholdTokens) {
    return summarizeChunk({
      client: params.client,
      historyText: params.historyText,
      previousSummary: params.previousSummary,
      customInstructions: params.customInstructions,
      splitTurn: params.splitTurn,
      prefixText: params.prefixText,
      summaryCharLimit: params.summaryCharLimit,
      requestTimeoutMs: params.requestTimeoutMs,
    });
  }
  const chunks = splitByTokens(params.historyText, maxChunkTokens);
  const partialSummaries: string[] = [];
  let usageTotals: { input?: number; output?: number; total?: number } | undefined;
  for (const chunk of chunks) {
    const partial = await summarizeChunk({
      client: params.client,
      historyText: chunk,
      summaryCharLimit: params.summaryCharLimit,
      requestTimeoutMs: params.requestTimeoutMs,
    });
    partialSummaries.push(partial.summary);
    if (partial.usage) {
      usageTotals = usageTotals ?? { input: 0, output: 0, total: 0 };
      usageTotals.input = (usageTotals.input ?? 0) + (partial.usage.input ?? 0);
      usageTotals.output = (usageTotals.output ?? 0) + (partial.usage.output ?? 0);
      usageTotals.total = (usageTotals.total ?? 0) + (partial.usage.total ?? 0);
    }
  }
  const merged = await summarizeChunk({
    client: params.client,
    historyText: partialSummaries.map((value, idx) => `分段${idx + 1}摘要:\n${value}`).join("\n\n"),
    summaryCharLimit: params.summaryCharLimit,
    requestTimeoutMs: params.requestTimeoutMs,
  });
  return { summary: merged.summary, usage: usageTotals ?? merged.usage };
}

async function main() {
  if (!apiKey) {
    throw new Error("SUMMARY_API_KEY is required");
  }
  const redis = createClient({ url: redisUrl });
  await redis.connect();
  try {
    await redis.xGroupCreate(jobStream, consumerGroup, "0", { MKSTREAM: true });
  } catch (err) {
    if (!String(err).includes("BUSYGROUP")) {
      throw err;
    }
  }

  const openai = new OpenAI({ apiKey, baseURL: baseUrl });

  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === "/metrics") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      res.end(await registry.metrics());
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
  });
  server.listen(Number.isFinite(port) && port > 0 ? port : 9921, "0.0.0.0");

  const handleRecord = async (record: ClaimMessage) => {
    const payload = record.message.payload;
    const startedAt = Date.now();
    const traceId = randomUUID();
    let result: SummaryOffloadResult | null = null;
    try {
      if (typeof payload !== "string") {
        throw new Error("missing payload");
      }
      const job = JSON.parse(payload) as SummaryOffloadJob;
      const deadline = Number.isFinite(job.deadlineMs) ? job.deadlineMs : timeoutMs;
      if (Date.now() - job.createdAt > deadline) {
        throw new Error("job expired");
      }
      const res = await summarizeHistory({
        client: openai,
        historyText: job.historyText,
        prefixText: job.prefixText,
        previousSummary: job.previousSummary,
        customInstructions: job.customInstructions,
        splitTurn: job.splitTurn,
        summaryCharLimit,
        requestTimeoutMs: Math.max(1000, Math.min(timeoutMs, deadline)),
      });
      result = {
        jobId: job.jobId,
        offloadId: job.offloadId,
        traceId: job.traceId ?? traceId,
        status: "ok",
        summary: res.summary,
        durationMs: Date.now() - startedAt,
        summaryLen: res.summary.length,
        sessionFile: job.sessionFile,
      };
    } catch (err) {
      result = {
        jobId: "",
        offloadId: "",
        traceId,
        status: "fail",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      };
    }
    if (result.status === "ok" && typeof result.durationMs === "number") {
      summaryDurationSeconds.observe(result.durationMs / 1000);
    }
    if (Math.random() < logSampleRate) {
      process.stdout.write(
        `${JSON.stringify({
          event: "summary_job",
          trace_id: result.traceId,
          status: result.status,
          summary_len: result.summaryLen,
          cost: result.cost,
          duration_ms: result.durationMs,
        })}\n`,
      );
    }
    await redis.xAdd(resultStream, "*", { payload: JSON.stringify(result) });
    await redis.xAck(jobStream, consumerGroup, record.id);
  };

  let nextClaimId = "0-0";
  while (true) {
    if (claimIdleMs > 0) {
      const claimResponse = (await redis.xAutoClaim(
        jobStream,
        consumerGroup,
        consumerName,
        claimIdleMs,
        nextClaimId,
        { COUNT: 20 },
      )) as unknown as ClaimResponse;
      if (claimResponse?.nextId) {
        nextClaimId = claimResponse.nextId;
      }
      if (Array.isArray(claimResponse?.messages)) {
        for (const record of claimResponse.messages) {
          await handleRecord(record);
        }
      }
    }
    const response = await redis.xReadGroup(
      consumerGroup,
      consumerName,
      { key: jobStream, id: ">" },
      { COUNT: 10, BLOCK: 1000 },
    );
    if (!response) {
      continue;
    }
    for (const stream of response) {
      for (const record of stream.messages) {
        await handleRecord(record as ClaimMessage);
      }
    }
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
