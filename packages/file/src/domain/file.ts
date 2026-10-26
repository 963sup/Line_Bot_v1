import { FileError } from "./error.js";
import {
  checkVersion,
  identifier,
  integer,
  type RevisionContext,
  scopeId,
  text,
} from "./values.js";

export const fileLimits = Object.freeze({
  bytes: 45 * 1024 * 1024,
});

/** A never-committed upload must be quiet for seven days before operator reclamation. */
export const uploadRecoveryPolicy = Object.freeze({ quietMillis: 7 * 24 * 60 * 60 * 1000 });

export type FileDescriptor = Readonly<{
  name: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
}>;

export type FileRevision = FileDescriptor &
  RevisionContext &
  Readonly<{
    fileId: string;
    version: number;
    parentRevisionId: string | null;
  }>;

export function nextFileRevision(
  current: FileRevision | null,
  expectedVersion: number,
  fileId: string,
  descriptor: FileDescriptor,
  context: RevisionContext,
): FileRevision {
  checkVersion(current, expectedVersion);
  const name = text(descriptor.name, 255).trim();
  const mediaType = text(descriptor.mediaType, 160).trim().toLowerCase();
  if (
    /[\\/\u0000-\u001f]/.test(name) ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)
  )
    throw new FileError(400, "Invalid filename or declared media type.", "INVALID_INPUT");
  if (!/^[a-f0-9]{64}$/.test(descriptor.sha256))
    throw new FileError(400, "Invalid content digest.", "INVALID_INPUT");
  const id = identifier(fileId);
  if (current && (current.fileId !== id || current.repositoryId !== context.repositoryId))
    throw new FileError(409, "File identity cannot change.", "SOURCE_INVALID");
  return {
    id: identifier(context.id),
    repositoryId: scopeId(context.repositoryId),
    actorUserId: text(context.actorUserId, 128),
    at: integer(context.at, 0, Number.MAX_SAFE_INTEGER),
    fileId: id,
    version: expectedVersion + 1,
    parentRevisionId: current?.id ?? null,
    name,
    mediaType,
    byteLength: integer(descriptor.byteLength, 1, fileLimits.bytes),
    sha256: descriptor.sha256,
  };
}

/**
 * An authorized, durable upload intent is not a committed FileRevision.
 * Once quarantined it retains a persistent reconciliation obligation because unknown object
 * writes may complete after an earlier absence observation.
 */
export type FileUploadIntent = Readonly<{
  requestId: string;
  expectedVersion: number;
  revision: FileRevision;
}>;
