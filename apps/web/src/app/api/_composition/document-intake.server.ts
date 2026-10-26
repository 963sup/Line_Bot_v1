import { createPostgresContractDocuments } from "@line_bot_v1/contract/composition/bootstrap/documents";
import {
  purchaseOrderExtractionSchema,
  purchaseOrderExtractionSchemaId,
  purchaseOrderExtractionSchemaVersion,
} from "@line_bot_v1/contract/contracts/input/document-intake";
import { createPostgresFileSourceReader } from "@line_bot_v1/file/composition/bootstrap/files";
import { createPurchaseOrderAgent } from "@line_bot_v1/integration-vercel/agents/purchase-order";
import { createVercelAiGateway } from "@line_bot_v1/integration-vercel/gateway";
import { gatewayConfiguration } from "@line_bot_v1/integration-vercel/gateway-config";
import {
  createDocumentIntakeWithExtractor,
  createPostgresDocumentIntakeAttempts,
} from "@line_bot_v1/intelligence/composition/bootstrap/document-intake";
import type { DocumentIntakeWebRuntime } from "../../../modules/document-intake/document-intake-http.server";
import { repositoryOwnerScope } from "./repository-owner-scope.server";

let runtime: DocumentIntakeWebRuntime | undefined;

export function documentIntake(): DocumentIntakeWebRuntime {
  if (runtime) return runtime;
  const gateway = gatewayConfiguration();
  if (!gateway) {
    runtime = { scope: repositoryOwnerScope, intake: null, documents: null };
    return runtime;
  }
  const target = createPostgresContractDocuments();
  const agent = createPurchaseOrderAgent({
    gateway: createVercelAiGateway(gateway).transport,
    model: gateway.model,
  });
  const intake = createDocumentIntakeWithExtractor({
    attempts: createPostgresDocumentIntakeAttempts(),
    reader: createPostgresFileSourceReader(),
    target,
    schema: {
      id: purchaseOrderExtractionSchemaId,
      version: purchaseOrderExtractionSchemaVersion,
      schema: purchaseOrderExtractionSchema,
    },
    extractor: agent.documentExtractor(),
  });
  runtime = { scope: repositoryOwnerScope, intake, documents: target };
  return runtime;
}
