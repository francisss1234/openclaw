export function buildSummaryPrompt(params: {
  historyText: string;
  previousSummary?: string;
  customInstructions?: string;
  splitTurn?: boolean;
  prefixText?: string;
  summaryCharLimit: number;
}): Array<{ role: "system" | "user"; content: string }> {
  const lines: string[] = [];
  if (params.previousSummary) {
    lines.push("已有摘要:");
    lines.push(params.previousSummary.trim());
    lines.push("");
  }
  if (params.customInstructions) {
    lines.push("额外关注点:");
    lines.push(params.customInstructions.trim());
    lines.push("");
  }
  lines.push("对话历史:");
  lines.push(params.historyText.trim());
  if (params.splitTurn && params.prefixText) {
    lines.push("");
    lines.push("本轮前半段:");
    lines.push(params.prefixText.trim());
  }
  lines.push("");
  lines.push('输出格式(JSON): {"summary":"..."}');
  lines.push(`字数上限: ${params.summaryCharLimit} 中文字符`);
  lines.push("仅输出 JSON");

  return [
    {
      role: "system",
      content: "你是 OpenClaw 的上下文压缩摘要器，需保留关键决策、待办、约束与未解决问题。",
    },
    {
      role: "user",
      content: lines.join("\n"),
    },
  ];
}
