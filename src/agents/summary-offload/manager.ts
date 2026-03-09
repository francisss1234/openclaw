import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "../../config/config.js";
import { observeSummaryDurationSeconds } from "../../infra/metrics.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { createSummaryQueueClient } from "./queue.js";
import { replaceCompactionSummary } from "./session-update.js";
import type { SummaryOffloadConfig, SummaryOffloadJob, SummaryOffloadResult } from "./types.js";

type PendingJob = {
  job: SummaryOffloadJob;
  timeout: NodeJS.Timeout;
  attempts: number;
};

export type SummaryOffloadManager = {
  enqueue: (job: SummaryOffloadJob) => Promise<boolean>;
  isPaused: () => boolean;
  getConfig: () => SummaryOffloadConfig;
  stop: () => Promise<void>;
};

const log = createSubsystemLogger("summary-offload");

export function resolveSummaryOffloadConfig(cfg?: OpenClawConfig): SummaryOffloadConfig {
  const raw = cfg?.agents?.defaults?.compaction?.summaryOffload ?? {};
  return {
    enabled: raw.enabled ?? false,
    queue: raw.queue ?? {},
    retry: raw.retry ?? {},
    circuitBreaker: raw.circuitBreaker ?? {},
    pendingContext: raw.pendingContext ?? "last_pair",
    summaryCharLimit: raw.summaryCharLimit ?? 400,
    timeoutMs: raw.timeoutMs ?? 5000,
    logSampleRate: raw.logSampleRate ?? 0.1,
  };
}

export async function startSummaryOffloadManager(params: {
  cfg: OpenClawConfig;
}): Promise<SummaryOffloadManager | null> {
  const config = resolveSummaryOffloadConfig(params.cfg);
  if (!config.enabled) {
    return null;
  }
  const queue = await createSummaryQueueClient(config.queue);
  const controller = new AbortController();
  const pending = new Map<string, PendingJob>();
  let consecutiveFailures = 0;
  let pausedUntil = 0;

  const failureThreshold = Math.max(1, config.circuitBreaker?.failureThreshold ?? 3);
  const pauseMs = Math.max(1000, config.circuitBreaker?.pauseMs ?? 300_000);
  const retryInitialMs = Math.max(250, config.retry?.initialDelayMs ?? 5000);
  const retryMaxMs = Math.max(retryInitialMs, config.retry?.maxDelayMs ?? 60000);

  const isPaused = () => Date.now() < pausedUntil;

  const recordFailure = (error?: string) => {
    consecutiveFailures += 1;
    if (consecutiveFailures >= failureThreshold) {
      pausedUntil = Date.now() + pauseMs;
      consecutiveFailures = 0;
      log.warn(
        JSON.stringify({
          event: "summary_offload_paused",
          until: pausedUntil,
          error,
        }),
      );
    }
  };

  const recordSuccess = () => {
    consecutiveFailures = 0;
  };

  const scheduleRetry = (job: SummaryOffloadJob, attempts: number) => {
    if (isPaused()) {
      return;
    }
    const delay = Math.min(retryInitialMs * Math.max(1, attempts), retryMaxMs);
    setTimeout(() => {
      void enqueue(job, attempts + 1);
    }, delay);
  };

  const handleResult = async (result: SummaryOffloadResult, recordId: string) => {
    await queue.ackResult(recordId);
    const pendingJob = pending.get(result.jobId);
    if (!pendingJob) {
      return;
    }
    clearTimeout(pendingJob.timeout);
    if (result.status !== "ok" || !result.summary) {
      recordFailure(result.error ?? "summary failed");
      pending.delete(result.jobId);
      scheduleRetry(pendingJob.job, pendingJob.attempts);
      return;
    }
    pending.delete(result.jobId);
    recordSuccess();
    const summary = result.summary + pendingJob.job.summarySuffix;
    const updated = await replaceCompactionSummary({
      sessionFile: pendingJob.job.sessionFile,
      offloadId: pendingJob.job.offloadId,
      summary,
    });
    if (typeof result.durationMs === "number" && result.durationMs > 0) {
      observeSummaryDurationSeconds(result.durationMs / 1000);
    }
    if (Math.random() < (config.logSampleRate ?? 0.1)) {
      log.info(
        JSON.stringify({
          event: "summary_offload_applied",
          trace_id: result.traceId,
          summary_len: result.summaryLen ?? summary.length,
          cost: result.cost,
          updated,
          session_file: pendingJob.job.sessionFile,
        }),
      );
    }
  };

  const readLoop = queue.readResults(handleResult, controller.signal);
  void readLoop.catch((err) => {
    log.error(`summary offload loop failed: ${String(err)}`);
  });

  const enqueue = async (job: SummaryOffloadJob, attempts = 1): Promise<boolean> => {
    if (isPaused()) {
      return false;
    }
    const ok = await queue.enqueueJob(job, 200);
    if (!ok) {
      recordFailure("enqueue failed");
      return false;
    }
    const timeoutMs = Math.max(1000, config.timeoutMs ?? 5000);
    const timeout = setTimeout(() => {
      const pendingJob = pending.get(job.jobId);
      if (!pendingJob) {
        return;
      }
      pending.delete(job.jobId);
      recordFailure("summary timeout");
      scheduleRetry(pendingJob.job, pendingJob.attempts);
    }, timeoutMs);
    pending.set(job.jobId, { job, timeout, attempts });
    return true;
  };

  const stop = async () => {
    controller.abort();
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
    }
    pending.clear();
    await queue.close();
  };

  return {
    enqueue,
    isPaused,
    getConfig: () => config,
    stop,
  };
}

export function buildSummaryOffloadJob(params: {
  sessionFile: string;
  sessionId?: string;
  historyText: string;
  prefixText?: string;
  previousSummary?: string;
  customInstructions?: string;
  summarySuffix: string;
  splitTurn: boolean;
  timeoutMs: number;
}): SummaryOffloadJob {
  return {
    jobId: randomUUID(),
    offloadId: randomUUID(),
    traceId: randomUUID(),
    createdAt: Date.now(),
    deadlineMs: params.timeoutMs,
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
    historyText: params.historyText,
    prefixText: params.prefixText,
    previousSummary: params.previousSummary,
    customInstructions: params.customInstructions,
    summarySuffix: params.summarySuffix,
    splitTurn: params.splitTurn,
  };
}
