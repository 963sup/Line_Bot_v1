import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const serenaRoot = resolve(root, ".tools", "serena");
const bootstrapPython = resolve(serenaRoot, "uv-bootstrap", "Scripts", "python.exe");
const uv = resolve(serenaRoot, "uv-bootstrap", "Scripts", "uv.exe");
const codexPython = resolve(dirname(process.execPath), "..", "..", "python", "python.exe");
const codexPnpm = resolve(dirname(process.execPath), "..", "..", "bin", "fallback", "pnpm.cmd");
const entry = resolve(root, ".codex", "scripts", "serena-entry.py");
const configure = resolve(root, ".codex", "scripts", "configure-serena.py");

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(codexPython)) {
  console.error("Codex bundled Python was not found; run this script from Codex.");
  process.exit(1);
}
if (!existsSync(codexPnpm)) {
  console.error("Codex bundled pnpm was not found; run this script from Codex.");
  process.exit(1);
}
mkdirSync(serenaRoot, { recursive: true });
const nodeBin = resolve(serenaRoot, "node-bin");
mkdirSync(nodeBin, { recursive: true });
// Serena invokes npm to provision its private language server.  This directory is
// intentionally outside the repository workspace, so never let that invocation
// rewrite the root pnpm lockfile.
writeFileSync(resolve(nodeBin, "npm.cmd"), `@echo off\r\n"${codexPnpm}" --ignore-workspace %*\r\n`, "utf8");
if (!existsSync(bootstrapPython)) run(codexPython, ["-m", "venv", resolve(serenaRoot, "uv-bootstrap")]);
if (!existsSync(uv)) run(bootstrapPython, ["-m", "pip", "install", "--disable-pip-version-check", "uv==0.13.5"]);
const uvEnvironment = { UV_CACHE_DIR: resolve(serenaRoot, "cache"), UV_TOOL_BIN_DIR: resolve(serenaRoot, "bin"), UV_TOOL_DIR: resolve(serenaRoot, "tools") };
run(uv, ["tool", "install", "--no-managed-python", "--python", codexPython, "--link-mode", "copy", "serena-agent==2.1.0"], uvEnvironment);
run(resolve(serenaRoot, "tools", "serena-agent", "Scripts", "python.exe"), [entry, "init", "--language-backend", "LSP"], { ...uvEnvironment, SERENA_HOME: resolve(serenaRoot, "home") });
run(resolve(serenaRoot, "tools", "serena-agent", "Scripts", "python.exe"), [configure], { ...uvEnvironment, SERENA_HOME: resolve(serenaRoot, "home") });
run(resolve(serenaRoot, "tools", "serena-agent", "Scripts", "python.exe"), [entry, "download-ls-dependencies", "typescript"], { ...uvEnvironment, PATH: `${nodeBin};${dirname(process.execPath)};${process.env.PATH ?? ""}`, SERENA_HOME: resolve(serenaRoot, "home") });
