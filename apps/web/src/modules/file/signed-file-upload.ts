import { type FileInfo, parseMutation } from "@line_bot_v1/file/contracts/parse-files";
import { uploadSupabaseFile } from "@line_bot_v1/integration-supabase/browser-upload";
/** Browser-only File binary transport: File owner remains the authority for intents and commits. */
import {
  type FileMutation,
  type Pending,
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
  await uploadSupabaseFile(signedUrl, revisionId, next.file);
  assertCurrent();
  return parseMutation(await request({ operation: "complete-upload", command }));
}
