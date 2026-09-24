import { createHash } from "node:crypto";
import { createRedisExecution, type RedisTransport } from "./redis-execution.js";

// Both limits and expiration are evaluated atomically. Rejected global traffic
// does not create unbounded per-token keys. Values contain counters only.
const RATE_LIMIT_SCRIPT = `
local global = tonumber(redis.call('GET', KEYS[1]) or '0')
if global >= tonumber(ARGV[1]) then return 0 end
local subject = tonumber(redis.call('GET', KEYS[2]) or '0')
if subject >= tonumber(ARGV[2]) then return 0 end
global = redis.call('INCR', KEYS[1])
if global == 1 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
subject = redis.call('INCR', KEYS[2])
if subject == 1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
return 1`;

export class RedisRateLimiter {
  private readonly transport: Required<RedisTransport>;

  constructor(
    private readonly prefix: string,
    transport: RedisTransport,
  ) {
    if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix)) throw new Error("Invalid Redis namespace.");
    this.transport = createRedisExecution(transport);
  }

  async allow(
    scope: string,
    identity: string,
    globalLimit: number,
    subjectLimit: number,
    seconds = 60,
  ): Promise<boolean> {
    if (
      !/^[a-z-]{1,40}$/.test(scope) ||
      ![globalLimit, subjectLimit, seconds].every((n) => Number.isSafeInteger(n) && n > 0)
    ) {
      throw new Error("Invalid rate limit configuration.");
    }
    const hash = createHash("sha256").update(identity).digest("hex");
    return (
      Number(
        await this.transport.eval(
          RATE_LIMIT_SCRIPT,
          [`${this.prefix}:{${scope}}:global`, `${this.prefix}:{${scope}}:${hash}`],
          [String(globalLimit), String(subjectLimit), String(seconds)],
        ),
      ) === 1
    );
  }

  close() {
    this.transport.close();
  }
}
