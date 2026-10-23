import type { FileRevision } from "../../domain/file.js";
/** Explicitly selected provider boundary: output is untrusted, never a business command. */
export interface FileProcessor {
  readonly id: string;
  readonly version: string;
  readonly kind: "parser" | "ocr" | "ai";
  supports(mediaType: string): boolean;
  run(source: Readonly<{ revision: FileRevision; bytes: Uint8Array }>): Promise<unknown>;
}
