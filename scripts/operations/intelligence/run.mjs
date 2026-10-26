import { createPostgresContractDocuments } from "@line_bot_v1/contract/composition/bootstrap/documents";
import {
  purchaseOrderExtractionSchema,
  purchaseOrderExtractionSchemaId,
  purchaseOrderExtractionSchemaVersion,
} from "@line_bot_v1/contract/contracts/input/document-intake";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import { createPostgresFileSourceReader } from "@line_bot_v1/file/composition/bootstrap/files";
import { FileError } from "@line_bot_v1/file/domain/error";
import { createVercelAiGateway } from "@line_bot_v1/integration-vercel/gateway";
import {
  createDocumentIntakeWithExtractor,
  createPostgresDocumentIntakeAttempts,
} from "@line_bot_v1/intelligence/composition/bootstrap/document-intake";
import { DocumentAttemptError } from "@line_bot_v1/intelligence/contracts/output/document-attempts";
import { IntakeError } from "@line_bot_v1/intelligence/contracts/output/document-intake";
import { classifyInternalFailure } from "../../core/runtime/internal-failure.mjs";
import { InternalInputError } from "../../core/runtime/internal-input.mjs";
import { runInternalOperation } from "../../core/runtime/internal-operation.mjs";

const output = await runInternalOperation({
  errorMessage:
    "Intelligence operation failed; credentials, source bytes and provider payload are not logged.",
  errorClass: ContractError,
  classifyFailure: (error, errorClass, mutationStarted) => {
    const intakeFailure =
      error instanceof IntakeError || error instanceof DocumentAttemptError
        ? { status: error.status, code: error.code }
        : {};
    return {
      ...classifyInternalFailure(
        error,
        error instanceof FileError ? FileError : errorClass,
        mutationStarted,
      ),
      ...intakeFailure,
    };
  },
  operation: async ({ db, input, actor, markMutation }) => {
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
      if (!process.env.AI_GATEWAY_MODEL)
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
      const gateway = createVercelAiGateway({ model: process.env.AI_GATEWAY_MODEL });
      const intake = createDocumentIntakeWithExtractor({
        attempts: createPostgresDocumentIntakeAttempts(db),
        reader: createPostgresFileSourceReader(db),
        target,
        onTargetSubmit: () => {
          markMutation();
        },
        schema: {
          id: purchaseOrderExtractionSchemaId,
          version: purchaseOrderExtractionSchemaVersion,
          schema: purchaseOrderExtractionSchema,
        },
        extractor: gateway.documentExtractor(),
      });
      result = await intake(actor, input.command);
    } else throw new InternalInputError("Unknown Intelligence operation.");
    return result;
  },
});
(output.ok ? console.log : console.error)(JSON.stringify(output));
if (!output.ok) process.exitCode = 1;
