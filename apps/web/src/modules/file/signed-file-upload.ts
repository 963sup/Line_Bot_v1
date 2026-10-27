/** Browser-only File binary transport: File owner remains the authority for intents and commits. */
import {
  type FileInfo,
  type FileMutation,
  type Pending,
  parseMutation,
  record,
  type SignedCommand,
  stringValue,
} from "./files-projection";

/** A failed or lost provider PUT must still be reconciled through exact File-owned Finalize. */
export async function uploadSelectedFile(
  next: Pending,
  request: (mutation: FileMutation) => Promise<unknown>,
  assertCurrent: () => void,
): Promise<{ requestId: string; file: FileInfo }> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", await next.file.arrayBuffer()),
  );
  assertCurrent();
  const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const command: SignedCommand = { ...next.command, byteLength: next.file.size, sha256 };
  const prepared = record(await request({ operation: "prepare-upload", command }));
  if ("file" in prepared) return parseMutation(prepared);

  if (stringValue(prepared.requestId) !== command.requestId)
    throw new Error("Upload Intent identity mismatch.");
  const signedUrl = stringValue(prepared.signedUrl);
  const revisionId = stringValue(prepared.revisionId);
  const destination = new URL(signedUrl);
  if (
    destination.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/.test(destination.hostname) ||
    !destination.pathname.startsWith("/storage/v1/object/upload/sign/repository-files/") ||
    !destination.pathname.endsWith(`/${revisionId}`) ||
    !destination.searchParams.has("token")
  )
    throw new Error("Storage ticket is invalid.");

  const payload = new FormData();
  payload.set("cacheControl", "0");
  payload.append("", next.file);
  try {
    await fetch(signedUrl, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: payload,
      cache: "no-store",
    });
  } catch {
    // The provider may have stored exact bytes before the connection failed.
  }
  assertCurrent();
  return parseMutation(await request({ operation: "complete-upload", command }));
}
