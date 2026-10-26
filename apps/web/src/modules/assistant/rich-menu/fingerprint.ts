import { createHash } from "node:crypto";
import type { RichMenuDefinition } from "@line_bot_v1/line/rich-menu";

export function richMenuFingerprint(input: {
  page: string;
  image: Uint8Array;
  menu: RichMenuDefinition;
}) {
  const payload = canonicalJson({
    page: input.page,
    image: Buffer.from(input.image).toString("base64"),
    menu: input.menu,
  });
  return sha256(payload);
}

export function richMenuDefinitionHash(menu: RichMenuDefinition) {
  return sha256(canonicalJson(menu));
}

export function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}`;
  }
  return JSON.stringify(value);
}
