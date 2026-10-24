import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { createPostgresContractDependencies } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import { createPostgresContractDocuments } from "@line_bot_v1/contract/composition/bootstrap/documents";
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
  if (input.operation === "document-read") {
    if (
      typeof input.outputPath !== "string" ||
      !input.outputPath.trim() ||
      input.outputPath.length > 1024
    )
      throw new InternalInputError("Choose an output file for the protected document.");
    const revision = await createPostgresContractDocuments(db).read(actor, input.query);
    const outputPath = resolve(input.outputPath);
    try {
      await writeFile(outputPath, `${JSON.stringify(revision, null, 2)}\n`, {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error?.code === "EEXIST") throw new InternalInputError("Choose a new output file.");
      throw error;
    }
    result = {
      outputPath,
      documentId: revision.documentId,
      revisionId: revision.id,
      version: revision.version,
      state: revision.state,
      lineCount: revision.candidate.lines.length,
      diagnosticCount: revision.diagnostics.length,
    };
  } else if (input.operation === "document-submit") {
    mutationStarted = true;
    result = await createPostgresContractDocuments(db).submit(actor, input.command);
  } else if (input.operation === "document-receipt") {
    result = await createPostgresContractDocuments(db).receipt(actor, input.query);
  } else if (input.operation === "execute") {
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
