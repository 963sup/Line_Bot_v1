import { recognizeReceiptImage } from "../../adapters/outbound/recognition/receipt-recognizer.js";
import type { ReceiptRecognizer } from "../../contracts/ports/receipt-recognizer.js";

type ReceiptImage = Readonly<{ image: Uint8Array; mimeType: "image/jpeg" | "image/png" }>;

export function createReceiptRecognizer(config: {
  downloadImage(imageId: string): Promise<ReceiptImage>;
  generate(input: {
    prompt: string;
    image: Uint8Array;
    mimeType: "image/jpeg" | "image/png";
  }): Promise<string>;
}): ReceiptRecognizer {
  return async (imageId) =>
    recognizeReceiptImage({ generate: config.generate, ...(await config.downloadImage(imageId)) });
}
