import { GoogleGenAI } from "@google/genai";
import { geminiFileProcessor } from "../../adapters/outbound/processing/gemini.js";
import { plainTextProcessor } from "../../adapters/outbound/processing/plain-text.js";

export function createGeminiFileProcessor(config: { apiKey: string; model: string }) {
  return geminiFileProcessor({
    models: new GoogleGenAI({ apiKey: config.apiKey }).models,
    model: config.model,
  });
}

export { plainTextProcessor };
