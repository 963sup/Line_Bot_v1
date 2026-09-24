import { type GoogleRequestOptions, readPages, requestJson, resourceId } from "./request.js";

const base = "https://keep.googleapis.com/v1/notes";
export function listNotes(options: GoogleRequestOptions, request: typeof fetch = fetch) {
  return readPages(new URL(base), "notes", options, request);
}
/** noteId is the ID portion, without the notes/ prefix. */
export function getNote(
  options: GoogleRequestOptions & { noteId: string },
  request: typeof fetch = fetch,
) {
  return requestJson(new URL(`${base}/${resourceId(options.noteId)}`), options, request);
}
export function createNote(
  options: GoogleRequestOptions & { title: string; text: string },
  request: typeof fetch = fetch,
) {
  return requestJson(new URL(base), options, request, "POST", {
    title: options.title,
    body: { text: { text: options.text } },
  });
}
