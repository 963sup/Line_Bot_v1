import { createPostgresContractDocuments } from "@line_bot_v1/contract/composition/bootstrap/documents";
import {
  purchaseOrderExtractionSchema,
  purchaseOrderExtractionSchemaId,
  purchaseOrderExtractionSchemaVersion,
} from "@line_bot_v1/contract/contracts/input/document-intake";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import { createPostgresFileSourceReader } from "@line_bot_v1/file/composition/bootstrap/files";
import { FileError } from "@line_bot_v1/file/domain/error";
import { createGeminiDocumentIntake } from "@line_bot_v1/intelligence/composition/bootstrap/document-intake";
import { DocumentAttemptError } from "@line_bot_v1/intelligence/contracts/output/document-attempts";
import { IntakeError } from "@line_bot_v1/intelligence/contracts/output/document-intake";
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
  const target = createPostgresContractDocuments(db);
  const validCommand = (command) =>
    command &&
    typeof command === "object" &&
    typeof command.repositoryId === "string" &&
    typeof command.documentId === "string" &&
    typeof command.requestId === "string";
  let result;
  if (input.operation === "receipt") {
    if (!validCommand(input.command))
      throw new InternalInputError("A document intake command is required.");
    result = await target.receipt(actor, {
      repositoryId: input.command.repositoryId,
      documentId: input.command.documentId,
      requestId: input.command.requestId,
    });
  } else if (input.operation === "intake") {
    if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL)
      throw new InternalInputError("Configure the selected extractor.");
    if (
      !validCommand(input.command) ||
      !input.command.source ||
      typeof input.command.source.fileId !== "string" ||
      typeof input.command.source.fileRevisionId !== "string" ||
      typeof input.command.source.fileSha256 !== "string" ||
      !Number.isInteger(input.command.expectedVersion) ||
      !Number.isSafeInteger(input.command.expectedLineCount) ||
      input.command.expectedLineCount < 1 ||
      input.command.action !== "save"
    )
      throw new InternalInputError("A complete document intake command is required.");
    const intake = createGeminiDocumentIntake({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL,
      db,
      reader: createPostgresFileSourceReader(db),
      target,
      onTargetSubmit: () => {
        mutationStarted = true;
      },
      schema: {
        id: purchaseOrderExtractionSchemaId,
        version: purchaseOrderExtractionSchemaVersion,
        schema: purchaseOrderExtractionSchema,
      },
    });
    result = await intake(actor, input.command);
  } else throw new InternalInputError("Unknown Intelligence operation.");
  output = { ok: true, value: result };
} catch (error) {
  const intakeFailure =
    error instanceof IntakeError || error instanceof DocumentAttemptError
      ? { status: error.status, code: error.code }
      : {};
  output = {
    ok: false,
    error:
      "Intelligence operation failed; credentials, source bytes and provider payload are not logged.",
    ...classifyInternalFailure(
      error,
      error instanceof FileError ? FileError : ContractError,
      mutationStarted,
    ),
    ...intakeFailure,
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
