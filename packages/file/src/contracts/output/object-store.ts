import type { FileRevision } from "../../domain/file.js";

/** File owns authorization and revisions; this external Port owns only private object bytes. */
export interface FileObjectStore {
  putVerified(revision: FileRevision, bytes: Uint8Array): Promise<void>;
  readVerified(revision: FileRevision): Promise<Uint8Array>;
}

/** Destructive capability used only by the separately authorized File reclaimer. */
export interface FileObjectRemoval {
  removeVerified(revision: FileRevision): Promise<void>;
}
