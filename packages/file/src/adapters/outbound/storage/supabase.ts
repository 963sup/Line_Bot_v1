import { createHash } from "node:crypto";
import { createPrivateStorageClient } from "@line_bot_v1/integration-supabase/storage-client";
import type { FileObjectRemoval, FileObjectStore } from "../../../contracts/output/object-store.js";
import { FileError } from "../../../domain/error.js";
import type { FileRevision } from "../../../domain/file.js";

type StorageFailure = {
  status?: number | undefined;
  statusCode?: string | undefined;
  code?: string | undefined;
};
type PrivateBucket = {
  download(key: string): Promise<{ data: Blob | null; error: StorageFailure | null }>;
  remove(keys: string[]): Promise<{ error: StorageFailure | null }>;
  upload(
    key: string,
    bytes: Uint8Array,
    options: { upsert: false; contentType: string; cacheControl: string },
  ): Promise<{ error: StorageFailure | null }>;
};

function key(revision: FileRevision): string {
  const repository = createHash("sha256").update(revision.repositoryId).digest("hex");
  return `${repository}/${revision.fileId}/${revision.id}`;
}

function notFound(failure: StorageFailure | null): boolean {
  return failure?.status === 404 || failure?.statusCode === "404";
}

function verify(revision: FileRevision, bytes: Uint8Array): void {
  if (
    bytes.byteLength !== revision.byteLength ||
    createHash("sha256").update(bytes).digest("hex") !== revision.sha256
  )
    throw new FileError(503, "File object integrity is unavailable.", "UNAVAILABLE");
}

/** No path, signed URL, credential, or provider error is exposed to the File consumer. */
export function fileObjects(bucket: PrivateBucket): FileObjectStore & FileObjectRemoval {
  async function read(revision: FileRevision, missing: boolean): Promise<Uint8Array | null> {
    let response: Awaited<ReturnType<PrivateBucket["download"]>>;
    try {
      response = await bucket.download(key(revision));
    } catch {
      throw new FileError(503, "File object read unavailable.", "UNAVAILABLE");
    }
    if (response.error) {
      if (missing && notFound(response.error)) return null;
      throw new FileError(503, "File object read unavailable.", "UNAVAILABLE");
    }
    if (!response.data || response.data.size !== revision.byteLength)
      throw new FileError(503, "File object integrity is unavailable.", "UNAVAILABLE");
    const bytes = new Uint8Array(await response.data.arrayBuffer());
    verify(revision, bytes);
    return bytes;
  }
  return {
    async readVerified(revision) {
      const bytes = await read(revision, false);
      if (!bytes) throw new FileError(503, "File object unavailable.", "UNAVAILABLE");
      return bytes;
    },
    async removeVerified(revision) {
      try {
        await bucket.remove([key(revision)]);
      } catch {
        // Provider response is not proof; the separate readback decides the outcome.
      }
      let response: Awaited<ReturnType<PrivateBucket["download"]>>;
      try {
        response = await bucket.download(key(revision));
      } catch {
        throw new FileError(503, "File object removal unverified.", "UNAVAILABLE");
      }
      if (!notFound(response.error))
        throw new FileError(503, "File object removal unverified.", "UNAVAILABLE");
    },
    async putVerified(revision, bytes) {
      verify(revision, bytes);
      // Readback first resolves a previous unknown upload without overwriting anything.
      if (await read(revision, true)) return;
      try {
        await bucket.upload(key(revision), Buffer.from(bytes), {
          upsert: false,
          contentType: revision.mediaType,
          cacheControl: "0",
        });
      } catch {
        // Timeout/transport failure is not proof that the object was not written.
      }
      // A conflict or unknown outcome is accepted only when readback proves exact bytes.
      await read(revision, false);
    },
  };
}

export function supabaseFileObjects(config: {
  url: string;
  serviceRoleKey: string;
}): FileObjectStore & FileObjectRemoval {
  const url = config.url;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) || !config.serviceRoleKey.trim())
    throw new FileError(503, "File Storage is not configured.", "UNAVAILABLE");
  const client = createPrivateStorageClient(config);
  return fileObjects(client.storage.from("repository-files"));
}
