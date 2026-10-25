import { GoogleGenAI } from "@google/genai";
import type { FileSourceReader } from "@line_bot_v1/file/contracts/output/references";
import { geminiDocumentExtractor } from "../../adapters/outbound/extraction/gemini-document.js";
import { createDocumentIntake } from "../../application/use-cases/intake-document.js";
import type { DocumentAttempts } from "../../contracts/output/document-attempts.js";
import type { IntakeReceipt, IntakeSchema, IntakeTarget } from "../../contracts/output/document-intake.js";

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
