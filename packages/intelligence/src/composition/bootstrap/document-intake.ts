import { createPostgresFileRevisionQualifier } from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import type { Database } from "@line_bot_v1/platform/postgres";
import { createOpenAIDocumentExtractor } from "../../adapters/outbound/openai-document-extractor.js";
import { createPostgresDocumentAttempts } from "../../adapters/outbound/persistence/document-attempts.js";
import { createDocumentIntake } from "../../application/use-cases/intake-document.js";
import type { DocumentAttempts } from "../../contracts/output/document-attempts.js";
import type {
  DocumentExtractor,
  IntakeReceipt,
  IntakeSchema,
  IntakeTarget,
} from "../../contracts/output/document-intake.js";

export function createConfiguredOpenAIDocumentExtractor() {
  return process.env.OPENAI_API_KEY ? createOpenAIDocumentExtractor("gpt-4.1") : undefined;
}

export function createPostgresDocumentIntakeAttempts(db?: Database): DocumentAttempts {
  return createPostgresDocumentAttempts(createPostgresFileRevisionQualifier, db);
}

export function createDocumentIntakeWithExtractor(config: {
  attempts: DocumentAttempts;
  reader: FileSourceReader;
  target: IntakeTarget<IntakeReceipt>;
  schema: IntakeSchema;
  extractor: DocumentExtractor;
  onTargetSubmit?: () => void;
}) {
  return createDocumentIntake({
    reader: config.reader,
    target: config.target,
    attempts: config.attempts,
    extractor: config.extractor,
    schema: config.schema,
    ...(config.onTargetSubmit ? { onTargetSubmit: config.onTargetSubmit } : {}),
  });
}
