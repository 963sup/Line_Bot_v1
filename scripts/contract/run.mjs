import { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { createPostgresContractDependencies } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import { PostgresDatabase } from "@line_bot_v1/platform/postgres";
import { internalActor, readInternalInput } from "../runtime/internal-input.mjs";
import { loadRootEnv } from "../runtime/load-env.mjs";

loadRootEnv();
const db = new PostgresDatabase();
try {
  const input = await readInternalInput();
  const actor = await internalActor(db, input.proof);
  const store = createPostgresContractDependencies(db);
  const contracts = createContracts({ ...store, now: Date.now });
  let result;
  if (input.operation === "execute") result = await contracts.execute(actor, input.command);
  else if (input.operation === "list" && typeof input.repositoryId === "string")
    result = await contracts.list(actor, input.repositoryId, input.after);
  else if (input.operation === "read") result = await contracts.read(actor, input.query);
  else if (input.operation === "history")
    result = await contracts.history(actor, input.query, input.before);
  else throw new Error("Unknown Contract operation.");
  console.log(JSON.stringify({ ok: true, value: result }));
} catch {
  console.error(
    JSON.stringify({
      ok: false,
      error: "Contract operation failed; no credential or provider payload is logged.",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
