import type { SummaryOffloadManager } from "./manager.js";
import type { SummaryOffloadConfig } from "./types.js";

let summaryOffloadManager: SummaryOffloadManager | null = null;
let summaryOffloadConfig: SummaryOffloadConfig | null = null;

export function setSummaryOffloadRuntime(
  manager: SummaryOffloadManager | null,
  config: SummaryOffloadConfig | null,
): void {
  summaryOffloadManager = manager;
  summaryOffloadConfig = config;
}

export function getSummaryOffloadManager(): SummaryOffloadManager | null {
  return summaryOffloadManager;
}

export function getSummaryOffloadConfig(): SummaryOffloadConfig | null {
  return summaryOffloadConfig;
}
