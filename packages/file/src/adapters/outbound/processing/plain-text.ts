import type { FileProcessor } from "../../../contracts/output/processor.js";
import { FileError } from "../../../domain/error.js";
import { fileLimits } from "../../../domain/file.js";
import type { Observation } from "../../../domain/processing-run.js";

/** A real bounded UTF-8 adapter, not an OCR/AI placeholder. Each nonempty line is source evidence. */
export const plainTextProcessor: FileProcessor = {
  id: "plain-text",
  kind: "parser",
  version: "utf8-lines-v1",
  supports: (type) => type === "text/plain",
  async run({ revision, bytes }) {
    if (revision.mediaType !== "text/plain")
      throw new FileError(422, "Unsupported media type.", "UNSUPPORTED_MEDIA");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const observations: Observation[] = [];
    let offset = 0;
    for (const line of content.split(/\n/)) {
      const value = line.replace(/\r$/, "");
      if (value.trim()) {
        if (value.length > fileLimits.valueLength || observations.length >= fileLimits.observations)
          throw new FileError(
            400,
            "Text extraction exceeds the supported result bounds.",
            "INVALID_INPUT",
          );
        observations.push({
          id: `line-${observations.length + 1}`,
          label: "Source line",
          value,
          source: { kind: "text", start: offset, end: offset + value.length },
          uncertain: false,
        });
      }
      offset += line.length + 1;
    }
    return { documentKind: "plain-text", observations };
  },
};
