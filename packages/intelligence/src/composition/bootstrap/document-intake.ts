import { GoogleGenAI } from "@google/genai";
import type { ContractDocumentIntake } from "@line_bot_v1/contract/contracts/input/document-intake";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import type { Database } from "@line_bot_v1/platform/postgres";
import { geminiDocumentExtractor } from "../../adapters/outbound/extraction/gemini-document.js";
import { createPostgresDocumentAttempts } from "../../adapters/outbound/persistence/document-attempts.js";
import { createDocumentIntake } from "../../application/use-cases/intake-document.js";
import type { IntakeSchema } from "../../contracts/output/document-intake.js";

export function createGeminiDocumentIntake(config: {
  apiKey: string;
  model: string;
  db: Database;
  reader: FileSourceReader;
  target: ContractDocumentIntake;
  schema: IntakeSchema;
  onTargetSubmit?: () => void;
}) {
  const models = new GoogleGenAI({ apiKey: config.apiKey }).models;
  return createDocumentIntake({
    reader: config.reader,
    target: config.target,
    attempts: createPostgresDocumentAttempts(config.db),
    extractor: geminiDocumentExtractor({ models, model: config.model }),
    schema: config.schema,
    ...(config.onTargetSubmit ? { onTargetSubmit: config.onTargetSubmit } : {}),
  });
}
