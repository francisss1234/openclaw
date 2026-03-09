import fs from "node:fs/promises";
import path from "node:path";
import { emitSessionTranscriptUpdate } from "../../sessions/transcript-events.js";

export async function replaceCompactionSummary(params: {
  sessionFile: string;
  offloadId: string;
  summary: string;
}): Promise<boolean> {
  const filePath = params.sessionFile;
  const offloadToken = `[summary_offload:${params.offloadId}]`;
  const content = await fs.readFile(filePath, "utf-8").catch(() => null);
  if (!content) {
    return false;
  }
  const lines = content.split(/\r?\n/);
  let updated = false;
  const nextLines = lines.map((line) => {
    if (!line.trim()) {
      return line;
    }
    try {
      const parsed = JSON.parse(line) as { type?: string; summary?: string };
      if (parsed?.type !== "compaction" || typeof parsed.summary !== "string") {
        return line;
      }
      if (!parsed.summary.includes(offloadToken)) {
        return line;
      }
      const cleaned = parsed.summary.replace(offloadToken, "").trim();
      const nextSummary = params.summary.trim();
      const merged = nextSummary.length > 0 ? nextSummary : cleaned;
      const next = { ...parsed, summary: merged };
      updated = true;
      return JSON.stringify(next);
    } catch {
      return line;
    }
  });
  if (!updated) {
    return false;
  }
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `${path.basename(filePath)}.summary.tmp`);
  await fs.writeFile(tmpPath, nextLines.join("\n"), "utf-8");
  await fs.rename(tmpPath, filePath);
  emitSessionTranscriptUpdate(filePath);
  return true;
}
