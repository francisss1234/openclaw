import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import type { GatewayAuthMode, GatewayTailscaleMode } from "../../config/config.js";
import {
  CONFIG_PATH,
  loadConfig,
  readConfigFileSnapshot,
  resolveStateDir,
  resolveGatewayPort,
} from "../../config/config.js";
import { resolveGatewayAuth } from "../../gateway/auth.js";
import { startGatewayServer } from "../../gateway/server.js";
import type { GatewayWsLogStyle } from "../../gateway/ws-logging.js";
import { setGatewayWsLogStyle } from "../../gateway/ws-logging.js";
import { setVerbose } from "../../globals.js";
import { GatewayLockError } from "../../infra/gateway-lock.js";
import { formatPortDiagnostics, inspectPortUsage } from "../../infra/ports.js";
import { setConsoleSubsystemFilter, setConsoleTimestampPrefix } from "../../logging/console.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { defaultRuntime } from "../../runtime.js";
import { formatCliCommand } from "../command-format.js";
import { inheritOptionFromParent } from "../command-options.js";
import { forceFreePortAndWait } from "../ports.js";
import { ensureDevGatewayConfig } from "./dev.js";
import { runGatewayLoop } from "./run-loop.js";
import {
  describeUnknownError,
  extractGatewayMiskeys,
  maybeExplainGatewayServiceStop,
  parsePort,
  toOptionString,
} from "./shared.js";

type GatewayRunOpts = {
  port?: unknown;
  bind?: unknown;
  token?: unknown;
  auth?: unknown;
  password?: unknown;
  tailscale?: unknown;
  tailscaleResetOnExit?: boolean;
  allowUnconfigured?: boolean;
  force?: boolean;
  verbose?: boolean;
  claudeCliLogs?: boolean;
  wsLog?: unknown;
  compact?: boolean;
  rawStream?: boolean;
  rawStreamPath?: unknown;
  dev?: boolean;
  reset?: boolean;
  summaryService?: boolean;
  summaryServiceConfig?: unknown;
};

const gatewayLog = createSubsystemLogger("gateway");

const GATEWAY_RUN_VALUE_KEYS = [
  "port",
  "bind",
  "token",
  "auth",
  "password",
  "tailscale",
  "wsLog",
  "rawStreamPath",
  "summaryServiceConfig",
] as const;

const GATEWAY_RUN_BOOLEAN_KEYS = [
  "tailscaleResetOnExit",
  "allowUnconfigured",
  "dev",
  "reset",
  "force",
  "verbose",
  "claudeCliLogs",
  "compact",
  "rawStream",
  "summaryService",
] as const;

type SummaryServiceConfig = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  redisUrl?: string;
  jobStream?: string;
  resultStream?: string;
  consumerGroup?: string;
  consumerName?: string;
  port?: number;
  claimIdleMs?: number;
};

function resolvePnpmCommand(): { command: string; args: string[] } {
  const npmExecPath = process.env.npm_execpath?.trim();
  if (npmExecPath) {
    return { command: process.execPath, args: [npmExecPath] };
  }
  if (process.platform === "win32") {
    return { command: "pnpm.cmd", args: [] };
  }
  return { command: "pnpm", args: [] };
}

function normalizeSummaryServiceConfig(raw: unknown): SummaryServiceConfig {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const stringOr = (camel: string, snake: string) => {
    const camelVal = record[camel];
    if (typeof camelVal === "string") {
      return camelVal;
    }
    const snakeVal = record[snake];
    if (typeof snakeVal === "string") {
      return snakeVal;
    }
    return undefined;
  };
  const numberOr = (camel: string, snake: string) => {
    const camelVal = record[camel];
    if (typeof camelVal === "number" && Number.isFinite(camelVal)) {
      return camelVal;
    }
    const snakeVal = record[snake];
    if (typeof snakeVal === "number" && Number.isFinite(snakeVal)) {
      return snakeVal;
    }
    return undefined;
  };
  return {
    baseUrl: stringOr("baseUrl", "base_url"),
    apiKey: stringOr("apiKey", "api_key"),
    model: stringOr("model", "model"),
    redisUrl: stringOr("redisUrl", "redis_url"),
    jobStream: stringOr("jobStream", "job_stream"),
    resultStream: stringOr("resultStream", "result_stream"),
    consumerGroup: stringOr("consumerGroup", "consumer_group"),
    consumerName: stringOr("consumerName", "consumer_name"),
    port: numberOr("port", "port"),
    claimIdleMs: numberOr("claimIdleMs", "claim_idle_ms"),
  };
}

function normalizeSummaryServiceConfigList(raw: unknown): SummaryServiceConfig[] {
  if (Array.isArray(raw)) {
    return raw.map((entry) => normalizeSummaryServiceConfig(entry));
  }
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.instances)) {
    return record.instances.map((entry) => normalizeSummaryServiceConfig(entry));
  }
  return [normalizeSummaryServiceConfig(raw)];
}

function loadSummaryServiceConfig(configPath: string): SummaryServiceConfig[] {
  const raw = fs.readFileSync(configPath, "utf-8");
  return normalizeSummaryServiceConfigList(JSON.parse(raw));
}

function buildSummaryServiceEnv(config: SummaryServiceConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SUMMARY_BASE_URL: config.baseUrl ?? process.env.SUMMARY_BASE_URL,
    SUMMARY_API_KEY: config.apiKey ?? process.env.SUMMARY_API_KEY,
    SUMMARY_MODEL: config.model ?? process.env.SUMMARY_MODEL,
    SUMMARY_REDIS_URL: config.redisUrl ?? process.env.SUMMARY_REDIS_URL,
    SUMMARY_JOB_STREAM: config.jobStream ?? process.env.SUMMARY_JOB_STREAM,
    SUMMARY_RESULT_STREAM: config.resultStream ?? process.env.SUMMARY_RESULT_STREAM,
    SUMMARY_CONSUMER_GROUP: config.consumerGroup ?? process.env.SUMMARY_CONSUMER_GROUP,
    SUMMARY_CONSUMER_NAME: config.consumerName ?? process.env.SUMMARY_CONSUMER_NAME,
    SUMMARY_PORT: config.port ? String(config.port) : process.env.SUMMARY_PORT,
    SUMMARY_CLAIM_IDLE_MS: config.claimIdleMs
      ? String(config.claimIdleMs)
      : process.env.SUMMARY_CLAIM_IDLE_MS,
  };
}

function resolveGatewayRunOptions(opts: GatewayRunOpts, command?: Command): GatewayRunOpts {
  const resolved: GatewayRunOpts = { ...opts };

  for (const key of GATEWAY_RUN_VALUE_KEYS) {
    const inherited = inheritOptionFromParent(command, key);
    if (key === "wsLog") {
      // wsLog has a child default ("auto"), so prefer inherited parent CLI value when present.
      resolved[key] = inherited ?? resolved[key];
      continue;
    }
    resolved[key] = resolved[key] ?? inherited;
  }

  for (const key of GATEWAY_RUN_BOOLEAN_KEYS) {
    const inherited = inheritOptionFromParent<boolean>(command, key);
    resolved[key] = Boolean(resolved[key] || inherited);
  }

  return resolved;
}

async function runGatewayCommand(opts: GatewayRunOpts) {
  const isDevProfile = process.env.OPENCLAW_PROFILE?.trim().toLowerCase() === "dev";
  const devMode = Boolean(opts.dev) || isDevProfile;
  if (opts.reset && !devMode) {
    defaultRuntime.error("Use --reset with --dev.");
    defaultRuntime.exit(1);
    return;
  }

  setConsoleTimestampPrefix(true);
  setVerbose(Boolean(opts.verbose));
  if (opts.claudeCliLogs) {
    setConsoleSubsystemFilter(["agent/claude-cli"]);
    process.env.OPENCLAW_CLAUDE_CLI_LOG_OUTPUT = "1";
  }
  const wsLogRaw = (opts.compact ? "compact" : opts.wsLog) as string | undefined;
  const wsLogStyle: GatewayWsLogStyle =
    wsLogRaw === "compact" ? "compact" : wsLogRaw === "full" ? "full" : "auto";
  if (
    wsLogRaw !== undefined &&
    wsLogRaw !== "auto" &&
    wsLogRaw !== "compact" &&
    wsLogRaw !== "full"
  ) {
    defaultRuntime.error('Invalid --ws-log (use "auto", "full", "compact")');
    defaultRuntime.exit(1);
  }
  setGatewayWsLogStyle(wsLogStyle);

  if (opts.rawStream) {
    process.env.OPENCLAW_RAW_STREAM = "1";
  }
  const rawStreamPath = toOptionString(opts.rawStreamPath);
  if (rawStreamPath) {
    process.env.OPENCLAW_RAW_STREAM_PATH = rawStreamPath;
  }

  if (devMode) {
    await ensureDevGatewayConfig({ reset: Boolean(opts.reset) });
  }

  const cfg = loadConfig();
  const portOverride = parsePort(opts.port);
  if (opts.port !== undefined && portOverride === null) {
    defaultRuntime.error("Invalid port");
    defaultRuntime.exit(1);
  }
  const port = portOverride ?? resolveGatewayPort(cfg);
  if (!Number.isFinite(port) || port <= 0) {
    defaultRuntime.error("Invalid port");
    defaultRuntime.exit(1);
  }
  if (opts.force) {
    try {
      const { killed, waitedMs, escalatedToSigkill } = await forceFreePortAndWait(port, {
        timeoutMs: 2000,
        intervalMs: 100,
        sigtermTimeoutMs: 700,
      });
      if (killed.length === 0) {
        gatewayLog.info(`force: no listeners on port ${port}`);
      } else {
        for (const proc of killed) {
          gatewayLog.info(
            `force: killed pid ${proc.pid}${proc.command ? ` (${proc.command})` : ""} on port ${port}`,
          );
        }
        if (escalatedToSigkill) {
          gatewayLog.info(`force: escalated to SIGKILL while freeing port ${port}`);
        }
        if (waitedMs > 0) {
          gatewayLog.info(`force: waited ${waitedMs}ms for port ${port} to free`);
        }
      }
    } catch (err) {
      defaultRuntime.error(`Force: ${String(err)}`);
      defaultRuntime.exit(1);
      return;
    }
  }
  if (opts.token) {
    const token = toOptionString(opts.token);
    if (token) {
      process.env.OPENCLAW_GATEWAY_TOKEN = token;
    }
  }
  const authModeRaw = toOptionString(opts.auth);
  const authMode: GatewayAuthMode | null =
    authModeRaw === "token" || authModeRaw === "password" ? authModeRaw : null;
  if (authModeRaw && !authMode) {
    defaultRuntime.error('Invalid --auth (use "token" or "password")');
    defaultRuntime.exit(1);
    return;
  }
  const tailscaleRaw = toOptionString(opts.tailscale);
  const tailscaleMode: GatewayTailscaleMode | null =
    tailscaleRaw === "off" || tailscaleRaw === "serve" || tailscaleRaw === "funnel"
      ? tailscaleRaw
      : null;
  if (tailscaleRaw && !tailscaleMode) {
    defaultRuntime.error('Invalid --tailscale (use "off", "serve", or "funnel")');
    defaultRuntime.exit(1);
    return;
  }
  const passwordRaw = toOptionString(opts.password);
  const tokenRaw = toOptionString(opts.token);

  const snapshot = await readConfigFileSnapshot().catch(() => null);
  const configExists = snapshot?.exists ?? fs.existsSync(CONFIG_PATH);
  const configAuditPath = path.join(resolveStateDir(process.env), "logs", "config-audit.jsonl");
  const mode = cfg.gateway?.mode;
  if (!opts.allowUnconfigured && mode !== "local") {
    if (!configExists) {
      defaultRuntime.error(
        `Missing config. Run \`${formatCliCommand("openclaw setup")}\` or set gateway.mode=local (or pass --allow-unconfigured).`,
      );
    } else {
      defaultRuntime.error(
        `Gateway start blocked: set gateway.mode=local (current: ${mode ?? "unset"}) or pass --allow-unconfigured.`,
      );
      defaultRuntime.error(`Config write audit: ${configAuditPath}`);
    }
    defaultRuntime.exit(1);
    return;
  }
  const bindRaw = toOptionString(opts.bind) ?? cfg.gateway?.bind ?? "loopback";
  const bind =
    bindRaw === "loopback" ||
    bindRaw === "lan" ||
    bindRaw === "auto" ||
    bindRaw === "custom" ||
    bindRaw === "tailnet"
      ? bindRaw
      : null;
  if (!bind) {
    defaultRuntime.error('Invalid --bind (use "loopback", "lan", "tailnet", "auto", or "custom")');
    defaultRuntime.exit(1);
    return;
  }

  const miskeys = extractGatewayMiskeys(snapshot?.parsed);
  const authOverride =
    authMode || passwordRaw || tokenRaw || authModeRaw
      ? {
          ...(authMode ? { mode: authMode } : {}),
          ...(tokenRaw ? { token: tokenRaw } : {}),
          ...(passwordRaw ? { password: passwordRaw } : {}),
        }
      : undefined;
  const resolvedAuth = resolveGatewayAuth({
    authConfig: cfg.gateway?.auth,
    authOverride,
    env: process.env,
    tailscaleMode: tailscaleMode ?? cfg.gateway?.tailscale?.mode ?? "off",
  });
  const resolvedAuthMode = resolvedAuth.mode;
  const tokenValue = resolvedAuth.token;
  const passwordValue = resolvedAuth.password;
  const hasToken = typeof tokenValue === "string" && tokenValue.trim().length > 0;
  const hasPassword = typeof passwordValue === "string" && passwordValue.trim().length > 0;
  const hasSharedSecret =
    (resolvedAuthMode === "token" && hasToken) || (resolvedAuthMode === "password" && hasPassword);
  const canBootstrapToken = resolvedAuthMode === "token" && !hasToken;
  const authHints: string[] = [];
  if (miskeys.hasGatewayToken) {
    authHints.push('Found "gateway.token" in config. Use "gateway.auth.token" instead.');
  }
  if (miskeys.hasRemoteToken) {
    authHints.push(
      '"gateway.remote.token" is for remote CLI calls; it does not enable local gateway auth.',
    );
  }
  if (resolvedAuthMode === "password" && !hasPassword) {
    defaultRuntime.error(
      [
        "Gateway auth is set to password, but no password is configured.",
        "Set gateway.auth.password (or OPENCLAW_GATEWAY_PASSWORD), or pass --password.",
        ...authHints,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    defaultRuntime.exit(1);
    return;
  }
  if (resolvedAuthMode === "none") {
    gatewayLog.warn(
      "Gateway auth mode=none explicitly configured; all gateway connections are unauthenticated.",
    );
  }
  if (
    bind !== "loopback" &&
    !hasSharedSecret &&
    !canBootstrapToken &&
    resolvedAuthMode !== "trusted-proxy"
  ) {
    defaultRuntime.error(
      [
        `Refusing to bind gateway to ${bind} without auth.`,
        "Set gateway.auth.token/password (or OPENCLAW_GATEWAY_TOKEN/OPENCLAW_GATEWAY_PASSWORD) or pass --token/--password.",
        ...authHints,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    defaultRuntime.exit(1);
    return;
  }
  const tailscaleOverride =
    tailscaleMode || opts.tailscaleResetOnExit
      ? {
          ...(tailscaleMode ? { mode: tailscaleMode } : {}),
          ...(opts.tailscaleResetOnExit ? { resetOnExit: true } : {}),
        }
      : undefined;

  const summaryServiceConfigFromGateway = cfg.gateway?.summaryService;
  const summaryServiceEnabled =
    Boolean(opts.summaryService) ||
    process.env.OPENCLAW_SUMMARY_SERVICE_START === "1" ||
    summaryServiceConfigFromGateway?.enabled === true;
  const summaryChildren: Array<ReturnType<typeof spawn>> = [];
  if (summaryServiceEnabled) {
    const explicitConfigPath =
      toOptionString(opts.summaryServiceConfig) ??
      process.env.OPENCLAW_SUMMARY_SERVICE_CONFIG ??
      summaryServiceConfigFromGateway?.configPath;
    if (explicitConfigPath && !fs.existsSync(explicitConfigPath)) {
      defaultRuntime.error(`Missing summary service config: ${explicitConfigPath}`);
      defaultRuntime.exit(1);
      return;
    }
    const configs = explicitConfigPath
      ? loadSummaryServiceConfig(explicitConfigPath)
      : normalizeSummaryServiceConfigList(summaryServiceConfigFromGateway);
    if (configs.length === 0) {
      defaultRuntime.error("Summary service config requires at least one instance");
      defaultRuntime.exit(1);
      return;
    }
    const pnpmCommand = resolvePnpmCommand();
    configs.forEach((config, index) => {
      const env = buildSummaryServiceEnv(config);
      if (!env.SUMMARY_BASE_URL || !env.SUMMARY_API_KEY || !env.SUMMARY_MODEL) {
        defaultRuntime.error(`Summary service config ${index + 1} requires baseUrl/apiKey/model`);
        defaultRuntime.exit(1);
        return;
      }
      const child = spawn(
        pnpmCommand.command,
        [...pnpmCommand.args, "--filter", "@openclaw/summary-service", "start"],
        {
          cwd: process.cwd(),
          env,
          stdio: "inherit",
          windowsHide: true,
        },
      );
      child.on("exit", (code, signal) => {
        if (code === 0 || signal === "SIGTERM") {
          return;
        }
        gatewayLog.warn(
          `summary service exited (instance=${index + 1} code=${String(code)} signal=${String(signal)})`,
        );
      });
      summaryChildren.push(child);
    });
  }

  try {
    await runGatewayLoop({
      runtime: defaultRuntime,
      start: async () =>
        await startGatewayServer(port, {
          bind,
          auth: authOverride,
          tailscale: tailscaleOverride,
        }),
    });
  } catch (err) {
    if (
      err instanceof GatewayLockError ||
      (err && typeof err === "object" && (err as { name?: string }).name === "GatewayLockError")
    ) {
      const errMessage = describeUnknownError(err);
      defaultRuntime.error(
        `Gateway failed to start: ${errMessage}\nIf the gateway is supervised, stop it with: ${formatCliCommand("openclaw gateway stop")}`,
      );
      try {
        const diagnostics = await inspectPortUsage(port);
        if (diagnostics.status === "busy") {
          for (const line of formatPortDiagnostics(diagnostics)) {
            defaultRuntime.error(line);
          }
        }
      } catch {
        // ignore diagnostics failures
      }
      await maybeExplainGatewayServiceStop();
      defaultRuntime.exit(1);
      return;
    }
    defaultRuntime.error(`Gateway failed to start: ${String(err)}`);
    defaultRuntime.exit(1);
  } finally {
    for (const child of summaryChildren) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
    if (summaryChildren.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      for (const child of summaryChildren) {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }
    }
  }
}

export function addGatewayRunCommand(cmd: Command): Command {
  return cmd
    .option("--port <port>", "Port for the gateway WebSocket")
    .option(
      "--bind <mode>",
      'Bind mode ("loopback"|"lan"|"tailnet"|"auto"|"custom"). Defaults to config gateway.bind (or loopback).',
    )
    .option(
      "--token <token>",
      "Shared token required in connect.params.auth.token (default: OPENCLAW_GATEWAY_TOKEN env if set)",
    )
    .option("--auth <mode>", 'Gateway auth mode ("token"|"password")')
    .option("--password <password>", "Password for auth mode=password")
    .option("--tailscale <mode>", 'Tailscale exposure mode ("off"|"serve"|"funnel")')
    .option(
      "--tailscale-reset-on-exit",
      "Reset Tailscale serve/funnel configuration on shutdown",
      false,
    )
    .option(
      "--allow-unconfigured",
      "Allow gateway start without gateway.mode=local in config",
      false,
    )
    .option("--dev", "Create a dev config + workspace if missing (no BOOTSTRAP.md)", false)
    .option(
      "--reset",
      "Reset dev config + credentials + sessions + workspace (requires --dev)",
      false,
    )
    .option("--force", "Kill any existing listener on the target port before starting", false)
    .option("--verbose", "Verbose logging to stdout/stderr", false)
    .option(
      "--claude-cli-logs",
      "Only show claude-cli logs in the console (includes stdout/stderr)",
      false,
    )
    .option("--ws-log <style>", 'WebSocket log style ("auto"|"full"|"compact")', "auto")
    .option("--compact", 'Alias for "--ws-log compact"', false)
    .option("--raw-stream", "Log raw model stream events to jsonl", false)
    .option("--raw-stream-path <path>", "Raw stream jsonl path")
    .option("--summary-service", "Start the summary service alongside the gateway", false)
    .option(
      "--summary-service-config <path>",
      "Summary service config path (default: .local/summary-service.config.json)",
    )
    .action(async (opts, command) => {
      await runGatewayCommand(resolveGatewayRunOptions(opts, command));
    });
}
