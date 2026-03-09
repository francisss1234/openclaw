import { describe, expect, it } from "vitest";
import { buildSummaryPrompt } from "./prompt.js";

describe("buildSummaryPrompt", () => {
  it("includes history, json format, and char limit", () => {
    const messages = buildSummaryPrompt({
      historyText: "user: hello",
      previousSummary: "prev",
      customInstructions: "focus",
      splitTurn: true,
      prefixText: "prefix",
      summaryCharLimit: 400,
    });
    expect(messages[0]?.role).toBe("system");
    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("对话历史");
    expect(userContent).toContain("输出格式(JSON)");
    expect(userContent).toContain("字数上限: 400 中文字符");
    expect(userContent).toContain("已有摘要:");
    expect(userContent).toContain("额外关注点:");
    expect(userContent).toContain("本轮前半段:");
  });
});
