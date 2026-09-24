const OPERATION_TIMEOUT_MS = 2500;
const RETRY_COOLDOWN_MS = 5000;

export type RedisUnavailableCode =
  | "configuration"
  | "authentication"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_error"
  | "invalid_response"
  | "timeout"
  | "cooldown"
  | "transport";

export class RedisUnavailableError extends Error {
  constructor(readonly code: RedisUnavailableCode) {
    super("Redis temporarily unavailable.");
    this.name = "RedisUnavailableError";
  }
}

export interface RedisTransport {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  close?(): void;
}

export function redisUnavailableCode(error: unknown): RedisUnavailableCode | "unknown" {
  return error instanceof RedisUnavailableError ? error.code : "unknown";
}

export function createRedisExecution(transport: RedisTransport): Required<RedisTransport> {
  let retryAt = 0;

  return {
    async eval(script, keys, args) {
      if (Date.now() < retryAt) throw new RedisUnavailableError("cooldown");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          transport.eval(script, keys, args),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new RedisUnavailableError("timeout")),
              OPERATION_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (error) {
        retryAt = Date.now() + RETRY_COOLDOWN_MS;
        if (error instanceof RedisUnavailableError) throw error;
        throw new RedisUnavailableError("transport");
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    close() {
      transport.close?.();
    },
  };
}
