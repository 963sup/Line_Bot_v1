import { execFileSync } from "node:child_process";
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
        requirementPreflight:
          "Use preflight for ambiguous scope or safety only. Authorized docs restructuring may proceed through all migration batches without repeated planning or approval requests.",
        serena:
          "Reuse successful session capabilities. Follow AGENTS.md Serena context budget; no routine reindex/help/health-check. Read only task-relevant symbols and memories.",
        guidance:
          "Preserve existing changes. Follow applicable AGENTS.md; use pnpm check for verification. Hooks only cover apply_patch edits and lightweight checks; type/test/build/provider evidence remains separate.",
      }),
    },
  };
});
