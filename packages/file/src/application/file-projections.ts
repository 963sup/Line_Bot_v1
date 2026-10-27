import type { FileRevision, FileUploadIntent } from "../domain/file.js";

export function fileDto(r: FileRevision) {
  return {
    revisionId: r.id,
    repositoryId: r.repositoryId,
    fileId: r.fileId,
    version: r.version,
    parentRevisionId: r.parentRevisionId,
    actorUserId: r.actorUserId,
    at: r.at,
    name: r.name,
    mediaType: r.mediaType,
    byteLength: r.byteLength,
    sha256: r.sha256,
  };
}
export function pendingDto(intent: FileUploadIntent) {
  return {
    requestId: intent.requestId,
    fileId: intent.revision.fileId,
    revisionId: intent.revision.id,
    expectedVersion: intent.expectedVersion,
    name: intent.revision.name,
    mediaType: intent.revision.mediaType,
    byteLength: intent.revision.byteLength,
    sha256: intent.revision.sha256,
  };
}
