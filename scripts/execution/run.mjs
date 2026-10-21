import { createExecutions } from "@line_bot_v1/execution/application/use-cases/executions";
import { createPostgresExecutionDependencies } from "@line_bot_v1/execution/composition/bootstrap/executions";
import { ExecutionError } from "@line_bot_v1/execution/domain/error";
import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { classifyInternalFailure } from "../runtime/internal-failure.mjs";
import {
  InternalInputError,
  internalActor,
  readInternalInput,
} from "../runtime/internal-input.mjs";
import { loadRootEnv } from "../runtime/load-env.mjs";

let db;
let output;
let failed = false;
let mutationStarted = false;
try {
  loadRootEnv();
  db = new PostgresDatabase();
  const input = await readInternalInput();
  const actor = await internalActor(db, input.proof);
  const executions = createExecutions({
    ...createPostgresExecutionDependencies(db),
    now: Date.now,
  });
  let result;
  if (input.operation === "execute") {
    mutationStarted = true;
    result = await executions.execute(actor, input.command);
  } else if (input.operation === "read") result = await executions.read(actor, input.query);
  else if (input.operation === "list")
    result = await executions.list(actor, input.query, input.after);
  else if (input.operation === "history")
    result = await executions.history(actor, input.query, input.before);
  else throw new InternalInputError("Unknown Execution operation.");
  output = { ok: true, value: result };
} catch (error) {
  output = {
    ok: false,
    error: "Execution operation failed; no credential or provider payload is logged.",
    ...classifyInternalFailure(error, ExecutionError, mutationStarted),
  };
  failed = true;
} finally {
  if (db)
    try {
      await db.close();
    } catch {}
}

(failed ? console.error : console.log)(JSON.stringify(output));
if (failed) process.exitCode = 1;
