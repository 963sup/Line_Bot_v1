import type { GenerateContentParameters } from "@google/genai";
import { recognizeReceiptImage } from "../../adapters/outbound/recognition/gemini-receipt-recognizer.js";
import type { ReceiptRecognizer } from "../../contracts/ports/receipt-recognizer.js";

type ReceiptImage = Readonly<{
  image: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
}>;

type ReceiptModels = {
  generateContent(parameters: GenerateContentParameters): Promise<{ text?: string }>;
};

export function createGeminiReceiptRecognizer(config: {
  downloadImage(imageId: string): Promise<ReceiptImage>;
  models: ReceiptModels;
  model: string;
}): ReceiptRecognizer {
  return async (imageId) =>
    recognizeReceiptImage({
      models: config.models,
      model: config.model,
      ...(await config.downloadImage(imageId)),
    });
}
