import type { FileRevisionQualifier, FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import type { Database, Sql } from "@line_bot_v1/platform/postgres";
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
  reader: FileSourceReader;
  qualifier: (sql: Sql) => FileRevisionQualifier;
  onTargetSubmit?: () => void;
}) {
  if (!process.env.OPENAI_API_KEY) return undefined;
  return createDocumentIntake({
    reader: config.reader,
    target: config.target,
    attempts: createPostgresDocumentAttempts(config.qualifier, config.db),
    extractor: createOpenAIDocumentExtractor("gpt-4.1"),
    schema: config.schema,
    maxSourceBytes: maxOpenAIDocumentBytes,
    ...(config.onTargetSubmit ? { onTargetSubmit: config.onTargetSubmit } : {}),
  });
}
