import { createPostgresFileRevisionQualifier, createPostgresFileSourceReader } from "@line_bot_v1/file/composition/bootstrap/files";
import { createPostgresContractDocuments } from "@line_bot_v1/contract/composition/bootstrap/documents";
import {
  purchaseOrderExtractionSchema,
  purchaseOrderExtractionSchemaId,
  purchaseOrderExtractionSchemaVersion,
} from "@line_bot_v1/contract/contracts/input/document-intake";
import { createPostgresOpenAIDocumentIntake } from "@line_bot_v1/intelligence/composition/bootstrap/document-intake";
import type { DocumentIntakeWebRuntime } from "../../../modules/document-intake/document-intake-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let runtime: DocumentIntakeWebRuntime | undefined;

export function documentIntake(): DocumentIntakeWebRuntime {
  if (runtime) return runtime;
  const target = createPostgresContractDocuments({ qualifier: createPostgresFileRevisionQualifier });
  const intake = createPostgresOpenAIDocumentIntake({
    target,
    reader: createPostgresFileSourceReader(),
    qualifier: createPostgresFileRevisionQualifier,
    schema: {
      id: purchaseOrderExtractionSchemaId,
      version: purchaseOrderExtractionSchemaVersion,
      schema: purchaseOrderExtractionSchema,
    },
  });
  runtime = { scope: repositoryOwnerScope, intake: intake ?? null, documents: target };
  return runtime;
}
