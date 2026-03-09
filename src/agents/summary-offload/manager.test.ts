import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSummaryOffloadJob, startSummaryOffloadManager } from "./manager.js";

let handlerRef:
  | ((
      result: {
        jobId: string;
        offloadId: string;
        traceId: string;
        status: "ok" | "fail";
        error?: string;
        summary?: string;
      },
      recordId: string,
    ) => Promise<void>)
  | null = null;

const enqueueJob = vi.fn(async () => true);
const ackResult = vi.fn(async () => {});
const close = vi.fn(async () => {});

vi.mock("./queue.js", () => ({
  createSummaryQueueClient: async () => ({
    enqueueJob,
    readResults: async (handler: typeof handlerRef) => {
      handlerRef = handler;
    },
    ackResult,
    close,
  }),
}));

vi.mock("./session-update.js", () => ({
  replaceCompactionSummary: async () => true,
}));

vi.mock("../../infra/metrics.js", () => ({
  observeSummaryDurationSeconds: () => undefined,
}));

describe("summary offload manager", () => {
  beforeEach(() => {
    enqueueJob.mockClear();
    ackResult.mockClear();
    close.mockClear();
    handlerRef = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pauses after consecutive failures", async () => {
    const manager = await startSummaryOffloadManager({
      cfg: {
        agents: {
          defaults: {
            compaction: {
              summaryOffload: {
                enabled: true,
                circuitBreaker: { failureThreshold: 3, pauseMs: 300000 },
              },
            },
          },
        },
      },
    } as never);
    expect(manager).toBeTruthy();
    if (!manager || !handlerRef) {
      return;
    }
    const jobs = [1, 2, 3].map(() =>
      buildSummaryOffloadJob({
        sessionFile: "/tmp/session.jsonl",
        historyText: "user: hello",
        summarySuffix: "",
        splitTurn: false,
        timeoutMs: 1000,
      }),
    );
    for (const job of jobs) {
      await manager.enqueue(job);
      await handlerRef(
        {
          jobId: job.jobId,
          offloadId: job.offloadId,
          traceId: job.traceId,
          status: "fail",
          error: "boom",
        },
        "1",
      );
    }
    expect(manager.isPaused()).toBe(true);
    await manager.stop();
  });

  it("retries after failure", async () => {
    const manager = await startSummaryOffloadManager({
      cfg: {
        agents: {
          defaults: {
            compaction: {
              summaryOffload: {
                enabled: true,
                retry: { initialDelayMs: 10, maxDelayMs: 20 },
              },
            },
          },
        },
      },
    } as never);
    expect(manager).toBeTruthy();
    if (!manager || !handlerRef) {
      return;
    }
    const job = buildSummaryOffloadJob({
      sessionFile: "/tmp/session.jsonl",
      historyText: "user: hello",
      summarySuffix: "",
      splitTurn: false,
      timeoutMs: 1000,
    });
    await manager.enqueue(job);
    await handlerRef(
      {
        jobId: job.jobId,
        offloadId: job.offloadId,
        traceId: job.traceId,
        status: "fail",
        error: "boom",
      },
      "2",
    );
    vi.advanceTimersByTime(15);
    await vi.runOnlyPendingTimersAsync();
    expect(enqueueJob.mock.calls.length).toBeGreaterThan(1);
    await manager.stop();
  });

  it("acks result records for success and failure", async () => {
    const manager = await startSummaryOffloadManager({
      cfg: {
        agents: {
          defaults: {
            compaction: {
              summaryOffload: {
                enabled: true,
              },
            },
          },
        },
      },
    } as never);
    expect(manager).toBeTruthy();
    if (!manager || !handlerRef) {
      return;
    }
    const job = buildSummaryOffloadJob({
      sessionFile: "/tmp/session.jsonl",
      historyText: "user: hello",
      summarySuffix: "",
      splitTurn: false,
      timeoutMs: 1000,
    });
    await manager.enqueue(job);
    await handlerRef(
      {
        jobId: job.jobId,
        offloadId: job.offloadId,
        traceId: job.traceId,
        status: "ok",
        summary: "done",
      },
      "3",
    );
    await handlerRef(
      {
        jobId: job.jobId,
        offloadId: job.offloadId,
        traceId: job.traceId,
        status: "fail",
        error: "boom",
      },
      "4",
    );
    expect(ackResult).toHaveBeenCalledWith("3");
    expect(ackResult).toHaveBeenCalledWith("4");
    await manager.stop();
  });

  it("recovers after pause window", async () => {
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    const manager = await startSummaryOffloadManager({
      cfg: {
        agents: {
          defaults: {
            compaction: {
              summaryOffload: {
                enabled: true,
                circuitBreaker: { failureThreshold: 1, pauseMs: 1000 },
              },
            },
          },
        },
      },
    } as never);
    expect(manager).toBeTruthy();
    if (!manager || !handlerRef) {
      return;
    }
    const job = buildSummaryOffloadJob({
      sessionFile: "/tmp/session.jsonl",
      historyText: "user: hello",
      summarySuffix: "",
      splitTurn: false,
      timeoutMs: 1000,
    });
    await manager.enqueue(job);
    await handlerRef(
      {
        jobId: job.jobId,
        offloadId: job.offloadId,
        traceId: job.traceId,
        status: "fail",
        error: "boom",
      },
      "5",
    );
    expect(manager.isPaused()).toBe(true);
    vi.advanceTimersByTime(1200);
    expect(manager.isPaused()).toBe(false);
    await manager.stop();
  });
});
