import { collectChangeState } from "./state.mjs";

try {
  console.log(JSON.stringify(collectChangeState(), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
