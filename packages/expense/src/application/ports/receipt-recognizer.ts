import type { ReceiptReading } from "../../contracts/receipt-reading.js";

/** Downloads the protected image and invokes the model without persisting image bytes. */
export type ReceiptRecognizer = (imageId: string) => Promise<ReceiptReading>;
