import { spawnSync } from "node:child_process";
import { collectChangeState, evaluatePreflight, repositoryRoot } from "./state.mjs";

export function validateCommandSurface({
  npmExecPath = process.env.npm_execpath,
  spawn = spawnSync,
  cwd = repositoryRoot,
} = {}) {
  if (!npmExecPath) {
    throw new Error("change:finalize must run through the pinned pnpm command surface.");
  }
  const result = spawn(process.execPath, [npmExecPath, "validate"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      TURBO_TELEMETRY_DISABLED: "1",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm validate failed with status ${result.status ?? "unknown"}.`);
  }
}

function requireReadyState(state) {
  const issues = evaluatePreflight(state);
  if (issues.length) {
    throw new Error(issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  }
  return state;
}

export function finalizeChange({
  collectState = collectChangeState,
  validate = validateCommandSurface,
} = {}) {
  const before = requireReadyState(collectState());
  validate();
  const after = requireReadyState(collectState());
  for (const key of ["branch", "head", "originMain", "upstream"]) {
    if (before[key] !== after[key]) {
      throw new Error(`${key} changed during validation; validate the new exact revision again.`);
    }
  }
  return {
    ok: true,
    branch: after.branch,
    head: after.head,
    originMain: after.originMain,
    validated: "pnpm validate",
    unchangedHead: true,
  };
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(finalizeChange(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
