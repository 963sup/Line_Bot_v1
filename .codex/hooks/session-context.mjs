import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { context, run } from "./runtime.mjs";

run((event) => {
  const { root } = context(event);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const status = git("status", "--porcelain", "-uno");
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: JSON.stringify({
        root,
        branch: git("rev-parse", "--abbrev-ref", "HEAD"),
        revision: git("rev-parse", "--short", "HEAD"),
        trackedChanges: status ? status.split("\n").length : 0,
        bootstrapMarker: existsSync(resolve(root, ".tools/codex/installed.sha256")),
        guidance:
          "Preserve existing changes. Follow applicable AGENTS.md; use pnpm check for verification. A bootstrap marker is not a current health check. Hooks only cover apply_patch edits and lightweight checks; type/test/build/provider evidence remains separate.",
      }),
    },
  };
});
