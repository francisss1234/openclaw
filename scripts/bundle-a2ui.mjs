import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = path.resolve(import.meta.dirname, "..");
const hashFile = path.join(rootDir, "src", "canvas-host", "a2ui", ".bundle.hash");
const outputFile = path.join(rootDir, "src", "canvas-host", "a2ui", "a2ui.bundle.js");
const a2uiRendererDir = path.join(rootDir, "vendor", "a2ui", "renderers", "lit");
const a2uiAppDir = path.join(rootDir, "apps", "shared", "OpenClawKit", "Tools", "CanvasA2UI");

function run(cmd, args) {
  const isWin = process.platform === "win32";
  const bin = isWin ? "cmd.exe" : cmd;
  const cmdArgs = isWin ? ["/d", "/s", "/c", cmd, ...args] : args;
  const r = spawnSync(bin, cmdArgs, { stdio: "inherit", cwd: rootDir });
  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${r.status}`);
  }
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(entryPath, out) {
  const st = await fs.stat(entryPath);
  if (st.isDirectory()) {
    const entries = await fs.readdir(entryPath);
    for (const entry of entries) {
      await walk(path.join(entryPath, entry), out);
    }
    return;
  }
  out.push(entryPath);
}

function normalize(p) {
  return p.split(path.sep).join("/");
}

async function computeHash(inputPaths) {
  const files = [];
  for (const input of inputPaths) {
    await walk(input, files);
  }
  files.sort((a, b) => normalize(a).localeCompare(normalize(b)));
  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = normalize(path.relative(rootDir, filePath));
    hash.update(rel);
    hash.update("\0");
    hash.update(await fs.readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function main() {
  try {
    const rendererOk = await exists(a2uiRendererDir);
    const appOk = await exists(a2uiAppDir);

    if (!rendererOk || !appOk) {
      if (await exists(outputFile)) {
        process.stdout.write("A2UI sources missing; keeping prebuilt bundle.\n");
        return;
      }
      process.stderr.write(`A2UI sources missing and no prebuilt bundle found at: ${outputFile}\n`);
      process.exitCode = 1;
      return;
    }

    const inputPaths = [
      path.join(rootDir, "package.json"),
      path.join(rootDir, "pnpm-lock.yaml"),
      a2uiRendererDir,
      a2uiAppDir,
    ];

    const currentHash = await computeHash(inputPaths);
    if (await exists(hashFile)) {
      const previousHash = (await fs.readFile(hashFile, "utf8")).trim();
      if (previousHash === currentHash && (await exists(outputFile))) {
        process.stdout.write("A2UI bundle up to date; skipping.\n");
        return;
      }
    }

    run("pnpm", ["-s", "exec", "tsc", "-p", path.join(a2uiRendererDir, "tsconfig.json")]);
    run("pnpm", ["-s", "exec", "rolldown", "-c", path.join(a2uiAppDir, "rolldown.config.mjs")]);

    await fs.mkdir(path.dirname(hashFile), { recursive: true });
    await fs.writeFile(hashFile, `${currentHash}\n`);
  } catch (err) {
    process.stderr.write("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle\n");
    process.stderr.write("If this persists, verify pnpm deps and try again.\n");
    process.stderr.write(String(err instanceof Error ? (err.stack ?? err.message) : err));
    process.stderr.write("\n");
    process.exitCode = 1;
  }
}

await main();
