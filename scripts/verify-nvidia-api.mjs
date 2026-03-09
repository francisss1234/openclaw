/**
 * Verification script for NVIDIA NIM (OpenAI-compatible) API.
 * Usage:
 *   export NVIDIA_API_KEY="nvapi-..."
 *   npm install openai --no-save
 *   node scripts/verify-nvidia-api.mjs
 */

import OpenAI from "openai";

async function main() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("Error: NVIDIA_API_KEY environment variable is missing.");
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://integrate.api.nvidia.com/v1",
  });

  const start = Date.now();

  try {
    // 5s timeout race
    const response = await Promise.race([
      client.chat.completions.create({
        model: "nvidia/llama-3.1-nemotron-70b-instruct", // Using a reliable NIM model
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out after 5000ms")), 5000),
      ),
    ]);

    const latency_ms = Date.now() - start;

    if (!response || !response.choices?.[0]?.message?.content) {
      throw new Error("Invalid response structure or empty content");
    }

    console.log(JSON.stringify({ status: "ok", latency_ms, error: null }));
    process.exit(0);
  } catch (err) {
    const latency_ms = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ status: "fail", latency_ms, error: errorMsg }));
    process.exit(1);
  }
}

void main();
