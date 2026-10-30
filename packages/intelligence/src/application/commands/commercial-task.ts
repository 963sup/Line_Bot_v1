import { createHash } from "node:crypto";

function derivedUuid(taskId: string, stage: string) {
  const hex = createHash("sha256")
    .update(`commercial-task/1:${taskId}:${stage}`)
    .digest("hex")
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

function taskId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
    throw new Error("Commercial task ID is invalid.");
  return value.toLowerCase();
}

/** Stable identities preserve exact retries across task transports and process restarts. */
export function commercialTaskIdentity(value: unknown) {
  const task = taskId(value);
  return {
    commandId: derivedUuid(task, "intelligence"),
    documentId: derivedUuid(task, "contract-document"),
    draftCommandId: derivedUuid(task, "contract-draft"),
  };
}
