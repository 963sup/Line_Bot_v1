import { GoogleGenAI } from "@google/genai";
import { createPostgresFileRevisionQualifier } from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import type { Database } from "@line_bot_v1/platform/postgres";
import { geminiDocumentExtractor } from "../../adapters/outbound/extraction/gemini-document.js";
import { createPostgresDocumentAttempts } from "../../adapters/outbound/persistence/document-attempts.js";
import { createDocumentIntake } from "../../application/use-cases/intake-document.js";
import type { DocumentAttempts } from "../../contracts/output/document-attempts.js";
import type {
  IntakeReceipt,
  IntakeSchema,
  IntakeTarget,
} from "../../contracts/output/document-intake.js";

export function createPostgresDocumentIntakeAttempts(db?: Database): DocumentAttempts {
  return createPostgresDocumentAttempts(createPostgresFileRevisionQualifier, db);
}

export function createGeminiDocumentIntake(config: {
  apiKey: string;
  model: string;
  attempts: DocumentAttempts;
  reader: FileSourceReader;
  target: IntakeTarget<IntakeReceipt>;
  schema: IntakeSchema;
  onTargetSubmit?: () => void;
}) {
  const models = new GoogleGenAI({ apiKey: config.apiKey }).models;
  return createDocumentIntake({
    reader: config.reader,
    target: config.target,
    attempts: config.attempts,
    extractor: geminiDocumentExtractor({ models, model: config.model }),
    schema: config.schema,
    ...(config.onTargetSubmit ? { onTargetSubmit: config.onTargetSubmit } : {}),
  });
}
