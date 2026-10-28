import {
  createPostgresFileRevisionQualifier,
  createPostgresFileSourceReader,
} from "@line_bot_v1/file/composition/bootstrap/files";
import type { Database } from "@line_bot_v1/platform/postgres";
import { createOpenAIDocumentExtractor } from "../../adapters/outbound/openai-document-extractor.js";
import { createPostgresDocumentAttempts } from "../../adapters/outbound/persistence/document-attempts.js";
import { createDocumentIntake } from "../../application/use-cases/intake-document.js";
import type {
  IntakeReceipt,
  IntakeSchema,
  IntakeTarget,
} from "../../contracts/output/document-intake.js";

const maxOpenAIDocumentBytes = 558_512;

export function createPostgresOpenAIDocumentIntake(config: {
  target: IntakeTarget<IntakeReceipt>;
  schema: IntakeSchema;
  db?: Database;
  onTargetSubmit?: () => void;
}) {
  if (!process.env.OPENAI_API_KEY) return undefined;
  return createDocumentIntake({
    reader: createPostgresFileSourceReader(config.db),
    target: config.target,
    attempts: createPostgresDocumentAttempts(createPostgresFileRevisionQualifier, config.db),
    extractor: createOpenAIDocumentExtractor("gpt-4.1"),
    schema: config.schema,
    maxSourceBytes: maxOpenAIDocumentBytes,
    ...(config.onTargetSubmit ? { onTargetSubmit: config.onTargetSubmit } : {}),
  });
}
