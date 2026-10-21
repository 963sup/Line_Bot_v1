import { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { createPostgresContractDependencies } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import { ContractError } from "@line_bot_v1/contract/domain/error";
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
  const store = createPostgresContractDependencies(db);
  const contracts = createContracts({ ...store, now: Date.now });
  let result;
  if (input.operation === "execute") {
    mutationStarted = true;
    result = await contracts.execute(actor, input.command);
  } else if (input.operation === "list" && typeof input.repositoryId === "string")
    result = await contracts.list(actor, input.repositoryId, input.after);
  else if (input.operation === "read") result = await contracts.read(actor, input.query);
  else if (input.operation === "history")
    result = await contracts.history(actor, input.query, input.before);
  else throw new InternalInputError("Unknown Contract operation.");
  output = { ok: true, value: result };
} catch (error) {
  output = {
    ok: false,
    error: "Contract operation failed; no credential or provider payload is logged.",
    ...classifyInternalFailure(error, ContractError, mutationStarted),
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
