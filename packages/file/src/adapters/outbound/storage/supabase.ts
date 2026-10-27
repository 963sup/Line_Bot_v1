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
  createSignedUploadUrl?(
    key: string,
    options: { upsert: false },
  ): Promise<{ data: { signedUrl: string } | null; error: StorageFailure | null }>;
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

/** Exact readback resolves uncertain writes; failed recovery preserves the provider failure. */
export function fileObjects(bucket: PrivateBucket, expectedOrigin?: string): FileObjectStore & FileObjectRemoval {
  async function read(revision: FileRevision, missing: boolean): Promise<Uint8Array | null> {
    const response = await bucket.download(key(revision));
    if (response.error) {
      if (missing && notFound(response.error)) return null;
      throw response.error;
    }
    if (!response.data || response.data.size !== revision.byteLength)
      throw new FileError(503, "File object integrity is unavailable.", "UNAVAILABLE");
    const bytes = new Uint8Array(await response.data.arrayBuffer());
    verify(revision, bytes);
    return bytes;
  }
  return {
    async signUpload(revision) {
      if (!bucket.createSignedUploadUrl)
        throw new FileError(503, "Signed File uploads are unavailable.", "UNAVAILABLE");
      const result = await bucket.createSignedUploadUrl(key(revision), { upsert: false });
      if (result.error) throw result.error;
      if (!result.data?.signedUrl)
        throw new FileError(503, "Signed File upload is unavailable.", "UNAVAILABLE");
      const url = new URL(result.data.signedUrl);
      if (url.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
          (expectedOrigin !== undefined && url.origin !== expectedOrigin) ||
          !url.pathname.startsWith("/storage/v1/object/upload/sign/repository-files/") ||
          !url.searchParams.has("token"))
        throw new FileError(503, "Invalid Storage upload ticket.", "UNAVAILABLE");
      return url.toString();
    },
    async readVerified(revision) {
      const bytes = await read(revision, false);
      if (!bytes) throw new FileError(503, "File object unavailable.", "UNAVAILABLE");
      return bytes;
    },
    async removeVerified(revision) {
      let failure: { error: unknown } | undefined;
      try {
        const response = await bucket.remove([key(revision)]);
        if (response.error) failure = { error: response.error };
      } catch (error) {
        failure = { error };
      }
      const response = await bucket.download(key(revision)).catch((error: unknown) => {
        throw failure ? failure.error : error;
      });
      if (!notFound(response.error)) {
        if (failure) throw failure.error;
        if (response.error) throw response.error;
        throw new FileError(503, "File object removal unverified.", "UNAVAILABLE");
      }
    },
    async putVerified(revision, bytes) {
      verify(revision, bytes);
      // Readback first resolves a previous unknown upload without overwriting anything.
      if (await read(revision, true)) return;
      let failure: { error: unknown } | undefined;
      try {
        // The payload is already a verified Uint8Array; avoid an additional full-size copy.
        const response = await bucket.upload(key(revision), bytes, {
          upsert: false,
          contentType: revision.mediaType,
          cacheControl: "0",
        });
        if (response.error) failure = { error: response.error };
      } catch (error) {
        failure = { error };
      }
      // A conflict or unknown outcome is accepted only when readback proves exact bytes.
      try {
        await read(revision, false);
      } catch (error) {
        throw failure ? failure.error : error;
      }
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
  return fileObjects(client.storage.from("repository-files"), new URL(url).origin);
}
