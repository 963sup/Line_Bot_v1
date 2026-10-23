import { createHash } from "node:crypto";
import type { FilePayloadInspector } from "../../../contracts/output/files.js";
import { FileError } from "../../../domain/error.js";
import { fileLimits } from "../../../domain/file.js";

export const filePayloadInspector: FilePayloadInspector = {
  inspect(input, name, mediaType) {
    if (
      !(input instanceof Uint8Array) ||
      input.byteLength < 1 ||
      input.byteLength > fileLimits.bytes
    )
      throw new FileError(400, "File payload is empty or exceeds the byte limit.", "INVALID_INPUT");
    const bytes = Uint8Array.from(input);
    return {
      bytes,
      descriptor: {
        name,
        mediaType,
        byteLength: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    };
  },
};
