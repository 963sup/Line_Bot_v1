import { FileError } from "../../domain/error.js";
import { fileLimits } from "../../domain/file.js";
import { identifier, object, only, scopeId, text, version } from "../../domain/values.js";

function base(value: Record<string, unknown>) {
  return {
    repositoryId: scopeId(value.repositoryId),
    requestId: identifier(value.requestId),
    expectedVersion: version(value.expectedVersion),
  };
}
export function uploadCommand(input: unknown) {
  const v = object(input);
  only(v, ["repositoryId", "requestId", "expectedVersion", "fileId", "name", "mediaType"]);
  return {
    ...base(v),
    fileId: identifier(v.fileId),
    name: text(v.name, 255).trim(),
    mediaType: text(v.mediaType, 160).trim().toLowerCase(),
  };
}

/** Client-provided descriptors are proposals until trusted Storage readback verifies bytes. */
export function directUploadCommand(input: unknown) {
  const v = object(input);
  only(v, [
    "repositoryId",
    "requestId",
    "expectedVersion",
    "fileId",
    "name",
    "mediaType",
    "byteLength",
    "sha256",
  ]);
  const command = uploadCommand({
    repositoryId: v.repositoryId,
    requestId: v.requestId,
    expectedVersion: v.expectedVersion,
    fileId: v.fileId,
    name: v.name,
    mediaType: v.mediaType,
  });
  if (
    typeof v.byteLength !== "number" ||
    !Number.isSafeInteger(v.byteLength) ||
    v.byteLength < 1 ||
    v.byteLength > fileLimits.bytes ||
    typeof v.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.sha256)
  )
    throw new FileError(400, "Invalid upload descriptor.", "INVALID_INPUT");
  return {
    ...command,
    descriptor: {
      name: command.name,
      mediaType: command.mediaType,
      byteLength: v.byteLength,
      sha256: v.sha256,
    },
  };
}
