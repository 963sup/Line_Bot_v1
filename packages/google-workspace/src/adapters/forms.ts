import { type GoogleRequestOptions, readPages, requestJson, resourceId } from "./request.js";

const base = "https://forms.googleapis.com/v1/forms";
export function getForm(
  options: GoogleRequestOptions & { formId: string },
  request: typeof fetch = fetch,
) {
  return requestJson(new URL(`${base}/${resourceId(options.formId)}`), options, request);
}
export function listFormResponses(
  options: GoogleRequestOptions & { formId: string },
  request: typeof fetch = fetch,
) {
  return readPages(
    new URL(`${base}/${resourceId(options.formId)}/responses`),
    "responses",
    options,
    request,
  );
}
export function createForm(
  options: GoogleRequestOptions & { title: string },
  request: typeof fetch = fetch,
) {
  return requestJson(new URL(base), options, request, "POST", { info: { title: options.title } });
}
/** Google Forms batchUpdate request objects; no respondent submission endpoint. */
export function updateForm(
  options: GoogleRequestOptions & {
    formId: string;
    requests: readonly Record<string, unknown>[];
    writeControl?: Record<string, unknown>;
  },
  request: typeof fetch = fetch,
) {
  return requestJson(
    new URL(`${base}/${resourceId(options.formId)}:batchUpdate`),
    options,
    request,
    "POST",
    { requests: options.requests, writeControl: options.writeControl },
  );
}
