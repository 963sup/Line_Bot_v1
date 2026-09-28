import {
  GoogleApiError,
  type GoogleRequestOptions,
  readPages,
  requestJson,
  resourceId,
} from "./request.js";

const base = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
/** @public Public Gmail adapter listed in packages/google-workspace/README.md. */
export function listMessages(
  options: GoogleRequestOptions & { query?: string },
  request: typeof fetch = fetch,
) {
  const url = new URL(base);
  if (options.query) url.searchParams.set("q", options.query);
  return readPages(url, "messages", options, request);
}
/** Returns the complete MIME tree; does not pretend the first text part is the whole message. */
export function getMessage(
  options: GoogleRequestOptions & { messageId: string },
  request: typeof fetch = fetch,
) {
  const url = new URL(`${base}/${resourceId(options.messageId)}`);
  url.searchParams.set("format", "full");
  return requestJson(url, options, request);
}
/** Caller constructs an RFC 2822 MIME message and explicitly authorizes sending. */
export function sendMessage(
  options: GoogleRequestOptions & { raw: string },
  request: typeof fetch = fetch,
) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(options.raw))
    throw new GoogleApiError(400, "Expected base64url MIME message");
  return requestJson(new URL(`${base}/send`), options, request, "POST", { raw: options.raw });
}
