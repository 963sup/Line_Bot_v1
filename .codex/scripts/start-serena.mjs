import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const serenaRoot = resolve(root, ".tools", "serena");
const python = resolve(serenaRoot, "tools", "serena-agent", "Scripts", "python.exe");
const entry = resolve(root, ".codex", "scripts", "serena-entry.py");

if (!existsSync(python)) {
  console.error("Serena is not installed for this worktree. Run: node tools/serena/bootstrap.mjs");
  process.exitCode = 1;
} else {
  const result = spawnSync(
    python,
    [entry, "start-mcp-server", "--project", root, "--context", "chatgpt", "--mode", "no-memories", "--agent-interface", "tools", "--enable-web-dashboard", "False", "--open-web-dashboard", "False", "--enable-gui-log-window", "False"],
    {
      cwd: root,
      env: { ...process.env, PATH: `${dirname(process.execPath)};${process.env.PATH ?? ""}`, SERENA_HOME: resolve(serenaRoot, "home") },
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
}
