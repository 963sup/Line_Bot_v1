import { createPostgresContractDocuments } from "@line_bot_v1/contract/composition/bootstrap/documents";
import {
  purchaseOrderExtractionSchema,
  purchaseOrderExtractionSchemaId,
  purchaseOrderExtractionSchemaVersion,
} from "@line_bot_v1/contract/contracts/input/document-intake";
import { createPostgresFileSourceReader } from "@line_bot_v1/file/composition/bootstrap/files";
import {
  createConfiguredOpenAIDocumentExtractor,
  createDocumentIntakeWithExtractor,
  createPostgresDocumentIntakeAttempts,
} from "@line_bot_v1/intelligence/composition/bootstrap/document-intake";
import type { DocumentIntakeWebRuntime } from "../../../modules/document-intake/document-intake-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let runtime: DocumentIntakeWebRuntime | undefined;

export function documentIntake(): DocumentIntakeWebRuntime {
  if (runtime) return runtime;
  const target = createPostgresContractDocuments();
  const extractor = createConfiguredOpenAIDocumentExtractor();
  if (!extractor) {
    runtime = { scope: repositoryOwnerScope, intake: null, documents: target };
    return runtime;
  }
  const intake = createDocumentIntakeWithExtractor({
    attempts: createPostgresDocumentIntakeAttempts(),
    reader: createPostgresFileSourceReader(),
    target,
    schema: {
      id: purchaseOrderExtractionSchemaId,
      version: purchaseOrderExtractionSchemaVersion,
      schema: purchaseOrderExtractionSchema,
    },
    extractor,
  });
  runtime = { scope: repositoryOwnerScope, intake, documents: target };
  return runtime;
}
