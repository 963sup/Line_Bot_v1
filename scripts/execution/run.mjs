import { createExecutions } from "@line_bot_v1/execution/application/use-cases/executions";
import { createPostgresExecutionDependencies } from "@line_bot_v1/execution/composition/bootstrap/executions";
import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { internalActor, readInternalInput } from "../runtime/internal-input.mjs";
import { loadRootEnv } from "../runtime/load-env.mjs";

loadRootEnv();
const db = new PostgresDatabase();
try {
  const input = await readInternalInput();
  const actor = await internalActor(db, input.proof);
  const executions = createExecutions({
    ...createPostgresExecutionDependencies(db),
    now: Date.now,
  });
  let result;
  if (input.operation === "execute") result = await executions.execute(actor, input.command);
  else if (input.operation === "read") result = await executions.read(actor, input.query);
  else if (input.operation === "list")
    result = await executions.list(actor, input.query, input.after);
  else if (input.operation === "history")
    result = await executions.history(actor, input.query, input.before);
  else throw new Error("Unknown Execution operation.");
  console.log(JSON.stringify({ ok: true, value: result }));
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Execution operation failed; no credential or provider payload is logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
