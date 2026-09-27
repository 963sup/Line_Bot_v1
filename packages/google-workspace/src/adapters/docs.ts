import { type GoogleRequestOptions, requestJson, resourceId } from "./request.js";

const base = "https://docs.googleapis.com/v1/documents";
export function getDocument(
  options: GoogleRequestOptions & { documentId: string },
  request: typeof fetch = fetch,
) {
  const url = new URL(`${base}/${resourceId(options.documentId)}`);
  url.searchParams.set("includeTabsContent", "true");
  return requestJson(url, options, request);
}
/** @public Public Docs adapter listed in packages/google-workspace/README.md. */
export function createDocument(
  options: GoogleRequestOptions & { title: string },
  request: typeof fetch = fetch,
) {
  return requestJson(new URL(base), options, request, "POST", { title: options.title });
}
/** @public Public Docs adapter listed in packages/google-workspace/README.md. */
export function updateDocument(
  options: GoogleRequestOptions & {
    documentId: string;
    requests: readonly Record<string, unknown>[];
    writeControl?: Record<string, unknown>;
  },
  request: typeof fetch = fetch,
) {
  return requestJson(
    new URL(`${base}/${resourceId(options.documentId)}:batchUpdate`),
    options,
    request,
    "POST",
    { requests: options.requests, writeControl: options.writeControl },
  );
}
