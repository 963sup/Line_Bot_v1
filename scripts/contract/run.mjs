import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createContracts } from "@line_bot_v1/contract/application/use-cases/contracts";
import { createPostgresContractDependencies } from "@line_bot_v1/contract/composition/bootstrap/contracts";
import { createPostgresContractDocuments } from "@line_bot_v1/contract/composition/bootstrap/documents";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import { InternalInputError } from "../runtime/internal-input.mjs";
import { runInternalOperation } from "../runtime/internal-operation.mjs";

const output = await runInternalOperation({
  errorMessage: "Contract operation failed; no credential or provider payload is logged.",
  errorClass: ContractError,
  operation: async ({ db, input, actor, markMutation }) => {
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
      markMutation();
      result = await createPostgresContractDocuments(db).submit(actor, input.command);
    } else if (input.operation === "document-receipt") {
      result = await createPostgresContractDocuments(db).receipt(actor, input.query);
    } else if (input.operation === "execute") {
      markMutation();
      result = await contracts.execute(actor, input.command);
    } else if (input.operation === "list" && typeof input.repositoryId === "string")
      result = await contracts.list(actor, input.repositoryId, input.after);
    else if (input.operation === "read") result = await contracts.read(actor, input.query);
    else if (input.operation === "history")
      result = await contracts.history(actor, input.query, input.before);
    else throw new InternalInputError("Unknown Contract operation.");
    return result;
  },
});

(output.ok ? console.log : console.error)(JSON.stringify(output));
if (!output.ok) process.exitCode = 1;
