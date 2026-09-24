/** Server-side credentials supplied by an authorized application use case. */
export interface GoogleRequestOptions {
  accessToken: string;
  signal?: AbortSignal;
}

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

export function operationSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(30_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function requestJson(
  url: URL,
  options: { signal?: AbortSignal; accessToken?: string },
  request: typeof fetch,
  method = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const signal = operationSignal(options.signal);
  signal.throwIfAborted();
  if (options.accessToken !== undefined && !options.accessToken.trim())
    throw new GoogleApiError(400, "Missing access token");
  try {
    const response = await request(url, {
      method,
      headers: {
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok)
      throw new GoogleApiError(response.status, `Google request failed (${response.status})`);
    if (response.status === 204) {
      signal.throwIfAborted();
      return {};
    }
    const data: unknown = await response.json();
    signal.throwIfAborted();
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new GoogleApiError(502, "Invalid Google response");
    return data as Record<string, unknown>;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof GoogleApiError) throw error;
    // Never expose transport URLs (Maps keys) or private response bodies.
    throw new GoogleApiError(502, "Google transport or response failure");
  }
}

export async function readPages(
  url: URL,
  key: string,
  options: GoogleRequestOptions,
  request: typeof fetch,
): Promise<Record<string, unknown>[]> {
  const signal = operationSignal(options.signal);
  const pageUrl = new URL(url);
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 1000; page++) {
    const data = await requestJson(pageUrl, { ...options, signal }, request);
    const rows = data[key] === undefined ? [] : data[key];
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))
    )
      throw new GoogleApiError(502, "Invalid Google collection");
    items.push(...rows);
    if (items.length > 100_000) throw new GoogleApiError(413, "Google collection too large");
    const next = data.nextPageToken;
    if (next === undefined) return items;
    if (typeof next !== "string" || !next || seen.has(next))
      throw new GoogleApiError(502, "Invalid Google pagination");
    seen.add(next);
    pageUrl.searchParams.set("pageToken", next);
  }
  throw new GoogleApiError(413, "Too many Google pages");
}

export function resourceId(value: string): string {
  if (!value.trim() || value === "." || value === "..")
    throw new GoogleApiError(400, "Invalid Google resource ID");
  return encodeURIComponent(value);
}
