import { fileLimits } from "@line_bot_v1/file/domain/file";
import type { IntelligenceProcessor } from "../../../application/use-cases/processing.js";

export const plainTextProcessor: IntelligenceProcessor = {
  id: "plain-text",
  kind: "parser",
  version: "utf8-lines-v1",
  supports: (type) => type === "text/plain",
  async run({ revision, bytes }) {
    if (revision.mediaType !== "text/plain") throw new Error("UNSUPPORTED_MEDIA");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const observations = content.split(/\n/).flatMap((line, index) => {
      const value = line.replace(/\r$/, "");
      if (!value.trim()) return [];
      if (value.length > fileLimits.valueLength) throw new Error("INVALID_INPUT");
      return [{ id: `line-${index + 1}`, label: "Source line", value, uncertain: false }];
    });
    if (observations.length > fileLimits.observations) throw new Error("INVALID_INPUT");
    return { documentKind: "plain-text", observations };
  },
};
