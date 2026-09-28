import { type GoogleRequestOptions, requestJson, resourceId } from "./request.js";

const base = "https://sheets.googleapis.com/v4/spreadsheets";
/** @public Public Sheets adapter listed in packages/google-workspace/README.md. */
export function getSpreadsheet(
  options: GoogleRequestOptions & { spreadsheetId: string },
  request: typeof fetch = fetch,
) {
  return requestJson(new URL(`${base}/${resourceId(options.spreadsheetId)}`), options, request);
}
/** @public Public Sheets adapter listed in packages/google-workspace/README.md. */
export function createSpreadsheet(
  options: GoogleRequestOptions & { title: string },
  request: typeof fetch = fetch,
) {
  return requestJson(new URL(base), options, request, "POST", {
    properties: { title: options.title },
  });
}
/** @public Public Sheets adapter listed in packages/google-workspace/README.md. */
export function readSheetValues(
  options: GoogleRequestOptions & { spreadsheetId: string; range: string },
  request: typeof fetch = fetch,
) {
  return requestJson(
    new URL(`${base}/${resourceId(options.spreadsheetId)}/values/${resourceId(options.range)}`),
    options,
    request,
  );
}
export function appendSheetValues(
  options: GoogleRequestOptions & {
    spreadsheetId: string;
    range: string;
    values: readonly (readonly (string | number | boolean | null)[])[];
    valueInputOption?: "RAW" | "USER_ENTERED";
  },
  request: typeof fetch = fetch,
) {
  const url = new URL(
    `${base}/${resourceId(options.spreadsheetId)}/values/${resourceId(options.range)}:append`,
  );
  url.searchParams.set("valueInputOption", options.valueInputOption ?? "RAW");
  return requestJson(url, options, request, "POST", {
    majorDimension: "ROWS",
    values: options.values,
  });
}
