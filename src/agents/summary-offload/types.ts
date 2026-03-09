export type SummaryOffloadJob = {
  jobId: string;
  offloadId: string;
  traceId: string;
  createdAt: number;
  deadlineMs: number;
  sessionFile: string;
  sessionId?: string;
  historyText: string;
  prefixText?: string;
  previousSummary?: string;
  customInstructions?: string;
  summarySuffix: string;
  splitTurn: boolean;
};

export type SummaryOffloadResult = {
  jobId: string;
  offloadId: string;
  traceId: string;
  status: "ok" | "fail";
  summary?: string;
  error?: string;
  durationMs?: number;
  summaryLen?: number;
  cost?: number;
  sessionFile?: string;
};

export type SummaryOffloadQueueConfig = {
  redisUrl?: string;
  jobStream?: string;
  resultStream?: string;
  consumerGroup?: string;
  consumerName?: string;
  blockMs?: number;
  claimIdleMs?: number;
};

export type SummaryOffloadRetryConfig = {
  initialDelayMs?: number;
  maxDelayMs?: number;
};

export type SummaryOffloadCircuitBreakerConfig = {
  failureThreshold?: number;
  pauseMs?: number;
};

export type SummaryOffloadConfig = {
  enabled?: boolean;
  queue?: SummaryOffloadQueueConfig;
  retry?: SummaryOffloadRetryConfig;
  circuitBreaker?: SummaryOffloadCircuitBreakerConfig;
  pendingContext?: "last_pair" | "none";
  summaryCharLimit?: number;
  timeoutMs?: number;
  logSampleRate?: number;
};
