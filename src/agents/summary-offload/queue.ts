import { createClient } from "redis";
import type {
  SummaryOffloadJob,
  SummaryOffloadQueueConfig,
  SummaryOffloadResult,
} from "./types.js";

export type SummaryQueueClient = {
  enqueueJob: (job: SummaryOffloadJob, timeoutMs: number) => Promise<boolean>;
  readResults: (
    handler: (result: SummaryOffloadResult, recordId: string) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<void>;
  ackResult: (recordId: string) => Promise<void>;
  close: () => Promise<void>;
};

type ClaimMessage = { id: string; message: { payload?: unknown } };
type ClaimResponse = { nextId?: string; messages?: ClaimMessage[] };

const DEFAULT_JOB_STREAM = "openclaw:summary:jobs";
const DEFAULT_RESULT_STREAM = "openclaw:summary:results";
const DEFAULT_GROUP = "openclaw-summary";
const DEFAULT_BLOCK_MS = 1000;
const DEFAULT_CLAIM_IDLE_MS = 60_000;

function normalizeQueueConfig(cfg?: SummaryOffloadQueueConfig) {
  return {
    redisUrl: cfg?.redisUrl ?? "redis://127.0.0.1:6379",
    jobStream: cfg?.jobStream ?? DEFAULT_JOB_STREAM,
    resultStream: cfg?.resultStream ?? DEFAULT_RESULT_STREAM,
    consumerGroup: cfg?.consumerGroup ?? DEFAULT_GROUP,
    consumerName: cfg?.consumerName ?? `summary-${process.pid}`,
    blockMs: cfg?.blockMs ?? DEFAULT_BLOCK_MS,
    claimIdleMs: cfg?.claimIdleMs ?? DEFAULT_CLAIM_IDLE_MS,
  };
}

async function ensureGroup(client: ReturnType<typeof createClient>, stream: string, group: string) {
  try {
    await client.xGroupCreate(stream, group, "0", { MKSTREAM: true });
  } catch (err) {
    if (String(err).includes("BUSYGROUP")) {
      return;
    }
    throw err;
  }
}

export async function createSummaryQueueClient(
  cfg?: SummaryOffloadQueueConfig,
): Promise<SummaryQueueClient> {
  const resolved = normalizeQueueConfig(cfg);
  const client = createClient({ url: resolved.redisUrl });
  await client.connect();
  await ensureGroup(client, resolved.resultStream, resolved.consumerGroup);

  const enqueueJob = async (job: SummaryOffloadJob, timeoutMs: number): Promise<boolean> => {
    const payload = JSON.stringify(job);
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 200;
    try {
      await Promise.race([
        client.xAdd(resolved.jobStream, "*", { payload }),
        new Promise((_, reject) => {
          const timer = setTimeout(() => {
            clearTimeout(timer);
            reject(new Error("enqueue timeout"));
          }, timeout);
        }),
      ]);
      return true;
    } catch {
      return false;
    }
  };

  const readResults = async (
    handler: (result: SummaryOffloadResult, recordId: string) => Promise<void>,
    signal: AbortSignal,
  ) => {
    let nextClaimId = "0-0";
    const maxClaim = 20;
    while (!signal.aborted) {
      if (resolved.claimIdleMs && resolved.claimIdleMs > 0) {
        try {
          const claimResponse = (await client.xAutoClaim(
            resolved.resultStream,
            resolved.consumerGroup,
            resolved.consumerName,
            resolved.claimIdleMs,
            nextClaimId,
            { COUNT: maxClaim },
          )) as unknown as ClaimResponse;
          if (claimResponse?.nextId) {
            nextClaimId = claimResponse.nextId;
          }
          if (Array.isArray(claimResponse?.messages)) {
            for (const message of claimResponse.messages) {
              const payload = message.message?.payload;
              if (typeof payload !== "string") {
                await handler(
                  {
                    jobId: "",
                    offloadId: "",
                    traceId: "",
                    status: "fail",
                    error: "missing payload",
                  },
                  message.id,
                );
                continue;
              }
              try {
                const parsed = JSON.parse(payload) as SummaryOffloadResult;
                await handler(parsed, message.id);
              } catch (err) {
                await handler(
                  {
                    jobId: "",
                    offloadId: "",
                    traceId: "",
                    status: "fail",
                    error: err instanceof Error ? err.message : String(err),
                  },
                  message.id,
                );
              }
            }
          }
        } catch {}
      }
      const response = await client.xReadGroup(
        resolved.consumerGroup,
        resolved.consumerName,
        { key: resolved.resultStream, id: ">" },
        { COUNT: 20, BLOCK: resolved.blockMs },
      );
      if (!response) {
        continue;
      }
      for (const stream of response) {
        for (const message of stream.messages) {
          const payload = message.message.payload;
          if (typeof payload !== "string") {
            await handler(
              {
                jobId: "",
                offloadId: "",
                traceId: "",
                status: "fail",
                error: "missing payload",
              },
              message.id,
            );
            continue;
          }
          try {
            const parsed = JSON.parse(payload) as SummaryOffloadResult;
            await handler(parsed, message.id);
          } catch (err) {
            await handler(
              {
                jobId: "",
                offloadId: "",
                traceId: "",
                status: "fail",
                error: err instanceof Error ? err.message : String(err),
              },
              message.id,
            );
          }
        }
      }
    }
  };

  const ackResult = async (recordId: string) => {
    await client.xAck(resolved.resultStream, resolved.consumerGroup, recordId);
  };

  const close = async () => {
    await client.quit();
  };

  return {
    enqueueJob,
    readResults,
    ackResult,
    close,
  };
}
