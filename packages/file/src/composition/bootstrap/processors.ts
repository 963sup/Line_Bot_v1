import { GoogleGenAI } from "@google/genai";
import { geminiFileProcessor } from "../../adapters/outbound/processing/gemini.js";

export { plainTextProcessor } from "../../adapters/outbound/processing/plain-text.js";

import type { FileProcessor } from "../../contracts/output/processor.js";
export function createGeminiFileProcessor(config: {
  apiKey: string;
  model: string;
}): FileProcessor {
  return geminiFileProcessor({
    models: new GoogleGenAI({ apiKey: config.apiKey }).models,
    model: config.model,
  });
}
