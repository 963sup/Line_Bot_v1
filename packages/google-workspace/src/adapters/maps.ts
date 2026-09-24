import { GoogleApiError, operationSignal, requestJson } from "./request.js";
/** Server-restricted Maps key, separate from Workspace OAuth. */
export async function geocodeAddress(
  options: { apiKey: string; address: string; signal?: AbortSignal },
  request: typeof fetch = fetch,
): Promise<Record<string, unknown>[]> {
  if (!options.apiKey.trim() || !options.address.trim())
    throw new GoogleApiError(400, "Missing geocoding input");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.search = new URLSearchParams({
    key: options.apiKey,
    address: options.address,
    language: "zh-TW",
    region: "tw",
  }).toString();
  const data = await requestJson(url, { signal: operationSignal(options.signal) }, request);
  if (data.status === "ZERO_RESULTS") return [];
  if (data.status !== "OK") throw new GoogleApiError(502, "Google geocoding failed");
  if (
    !Array.isArray(data.results) ||
    data.results.some((row) => !row || typeof row !== "object" || Array.isArray(row))
  )
    throw new GoogleApiError(502, "Invalid geocoding results");
  return data.results;
}
