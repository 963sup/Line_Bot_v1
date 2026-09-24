import { type GoogleRequestOptions, readPages, requestJson, resourceId } from "./request.js";

const base = "https://www.googleapis.com/drive/v3/files";
export function listFiles(
  options: GoogleRequestOptions & { query?: string },
  request: typeof fetch = fetch,
) {
  const url = new URL(base);
  url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink,trashed)");
  if (options.query) url.searchParams.set("q", options.query);
  return readPages(url, "files", options, request);
}
export function getFile(
  options: GoogleRequestOptions & { fileId: string },
  request: typeof fetch = fetch,
) {
  const url = new URL(`${base}/${resourceId(options.fileId)}`);
  url.searchParams.set("fields", "id,name,mimeType,webViewLink,trashed");
  return requestJson(url, options, request);
}
/** Moves to trash; does not permanently delete the file. */
export function trashFile(
  options: GoogleRequestOptions & { fileId: string },
  request: typeof fetch = fetch,
) {
  return requestJson(new URL(`${base}/${resourceId(options.fileId)}`), options, request, "PATCH", {
    trashed: true,
  });
}
