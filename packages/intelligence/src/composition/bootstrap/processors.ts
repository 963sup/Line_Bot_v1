import { GoogleGenAI } from "@google/genai";
import type { FileProcessor } from "@line_bot_v1/file/contracts/output/processor";
import { geminiFileProcessor } from "../../adapters/outbound/processing/gemini.js";

export function createGeminiFileProcessor(config: {
  apiKey: string;
  model: string;
}): FileProcessor {
  return geminiFileProcessor({
    models: new GoogleGenAI({ apiKey: config.apiKey }).models,
    model: config.model,
  });
}
