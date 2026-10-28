import { type RedisTransport, RedisUnavailableError } from "./redis-execution.js";

export interface RedisCommandTransport extends RedisTransport {
  command(parts: string[]): Promise<unknown>;
}

type Fetcher = typeof fetch;

export function createUpstashRedisRestTransport(
  url: string,
  token: string,
  request: Fetcher = fetch,
): RedisCommandTransport {
  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw new RedisUnavailableError("configuration");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !token
  )
    throw new RedisUnavailableError("configuration");

  const target = endpoint.href;
  const command = async (parts: string[]) => {
    let response: Response;
    try {
      response = await request(target, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parts),
      });
    } catch (error) {
      throw new RedisUnavailableError("transport", { cause: error });
    }
    const failure = async (code: ConstructorParameters<typeof RedisUnavailableError>[0]) => {
      const message = await response.text();
      throw new RedisUnavailableError(code, {
        cause: new Error(message || `${response.status} ${response.statusText}`),
      });
    };
    if (response.status === 401 || response.status === 403)
      await failure("authentication");
    if (response.status === 429) await failure("provider_rate_limited");
    if (response.status >= 500) await failure("provider_unavailable");
    if (!response.ok) await failure("provider_error");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new RedisUnavailableError("invalid_response", { cause: error });
    }
    if (!payload || typeof payload !== "object")
      throw new RedisUnavailableError("invalid_response", { cause: new Error(JSON.stringify(payload)) });
    if ("error" in payload && payload.error)
      throw new RedisUnavailableError("provider_error", { cause: new Error(JSON.stringify(payload.error)) });
    if (!("result" in payload))
      throw new RedisUnavailableError("invalid_response", { cause: new Error(JSON.stringify(payload)) });
    return payload.result;
  };

  return {
    command,
    eval(script, keys, args) {
      return command(["EVAL", script, String(keys.length), ...keys, ...args]);
    },
  };
}
