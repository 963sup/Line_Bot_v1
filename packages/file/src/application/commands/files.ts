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
