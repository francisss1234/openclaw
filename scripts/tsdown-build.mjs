#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

// On Windows, pnpm exec sometimes fails to find bin links. Use node directly.
let cmd, args;
const rootDir = path.resolve(import.meta.dirname, "..");

if (process.platform === "win32") {
  // Find tsdown package in pnpm store
  const tsdownPath = path.join(
    rootDir,
    "node_modules",
    ".pnpm",
    "tsdown@0.21.0_@typescript+n_0dc6a14be71e89fcf7742f2afcda0e58",
    "node_modules",
    "tsdown",
    "dist",
    "run.mjs",
  );
  cmd = "node";
  args = [
    tsdownPath,
    "--config-loader",
    "unrun",
    "--logLevel",
    process.env.OPENCLAW_BUILD_VERBOSE ? "info" : "warn",
  ];
} else {
  cmd = "pnpm";
  args = [
    "exec",
    "tsdown",
    "--config-loader",
    "unrun",
    "--logLevel",
    process.env.OPENCLAW_BUILD_VERBOSE ? "info" : "warn",
  ];
}

const result = spawnSync(cmd, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
