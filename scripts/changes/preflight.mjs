import { collectChangeState, evaluatePreflight } from "./state.mjs";

try {
  const state = collectChangeState();
  const issues = evaluatePreflight(state);
  console.log(JSON.stringify({ ok: issues.length === 0, state, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
