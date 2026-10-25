import type { IntelligenceProcessor } from "../../../application/use-cases/processing.js";

// These bound an Intelligence observation projection, not the File aggregate.
const observationLimits = { count: 500, valueLength: 4_000 } as const;

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
      if (value.length > observationLimits.valueLength) throw new Error("INVALID_INPUT");
      return [{ id: `line-${index + 1}`, label: "Source line", value, uncertain: false }];
    });
    if (observations.length > observationLimits.count) throw new Error("INVALID_INPUT");
    return { documentKind: "plain-text", observations };
  },
};
