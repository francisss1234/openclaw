import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSummaryQueueClient } from "./queue.js";

const connect = vi.fn(async () => {});
const xGroupCreate = vi.fn(async () => {});
const xAutoClaim = vi.fn(async () => ({
  nextId: "0-0",
  messages: [
    {
      id: "1-0",
      message: {
        payload: JSON.stringify({
          jobId: "job",
          offloadId: "offload",
          traceId: "trace",
          status: "ok",
          summary: "done",
        }),
      },
    },
  ],
}));
const xReadGroup = vi.fn(async () => null);
const xAdd = vi.fn(async () => "1-0");
const xAck = vi.fn(async () => 1);
const quit = vi.fn(async () => {});

vi.mock("redis", () => ({
  createClient: () => ({
    connect,
    xGroupCreate,
    xAutoClaim,
    xReadGroup,
    xAdd,
    xAck,
    quit,
  }),
}));

describe("summary offload queue", () => {
  beforeEach(() => {
    connect.mockClear();
    xGroupCreate.mockClear();
    xAutoClaim.mockClear();
    xReadGroup.mockClear();
    xAdd.mockClear();
    xAck.mockClear();
    quit.mockClear();
  });

  it("claims pending results and passes them to handler", async () => {
    const client = await createSummaryQueueClient({
      claimIdleMs: 1000,
    });
    const controller = new AbortController();
    const received: string[] = [];
    const readPromise = client.readResults(async (result) => {
      received.push(result.summary ?? "");
      controller.abort();
    }, controller.signal);
    await readPromise;
    expect(xAutoClaim).toHaveBeenCalled();
    expect(received).toEqual(["done"]);
    await client.close();
  });

  it("acks result records", async () => {
    const client = await createSummaryQueueClient();
    await client.ackResult("2-0");
    expect(xAck).toHaveBeenCalledWith("openclaw:summary:results", "openclaw-summary", "2-0");
    await client.close();
  });

  it("enqueues jobs to the stream", async () => {
    const client = await createSummaryQueueClient();
    const ok = await client.enqueueJob(
      {
        jobId: "job",
        offloadId: "offload",
        traceId: "trace",
        createdAt: Date.now(),
        deadlineMs: 1000,
        sessionFile: "/tmp/session.jsonl",
        historyText: "hi",
        summarySuffix: "",
        splitTurn: false,
      },
      100,
    );
    expect(ok).toBe(true);
    expect(xAdd).toHaveBeenCalled();
    await client.close();
  });
});
