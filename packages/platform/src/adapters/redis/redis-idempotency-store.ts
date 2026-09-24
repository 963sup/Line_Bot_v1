import { createHash, randomUUID } from "node:crypto";
import { createRedisExecution, type RedisTransport } from "./redis-execution.js";

export const IDEMPOTENCY_TTL_SECONDS = 600;

/** A single-key script keeps claiming independent events atomic across web processes. */
export const IDEMPOTENCY_CLAIM_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
  local status = string.match(current, '^completed:(%d+)$')
  if status then return {'completed', status} end
  return {'pending'}
end
redis.call('SET', KEYS[1], 'processing:' .. ARGV[1], 'EX', ARGV[2], 'NX')
return {'claimed', ARGV[1]}`;

/** Completion only succeeds when the claimant still owns the processing lease. */
export const IDEMPOTENCY_COMPLETE_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current ~= 'processing:' .. ARGV[1] then return 0 end
redis.call('SET', KEYS[1], 'completed:' .. ARGV[2], 'EX', ARGV[3])
return 1`;

export type IdempotencyClaim =
  | { state: "claimed"; token: string }
  | { state: "pending" }
  | { state: "completed"; status: number };

/**
 * Redis-backed webhook idempotency. Values store only a random lease token or
 * completion status; scope and event IDs are SHA-256 hashed before becoming keys.
 */
export class RedisIdempotencyStore {
  private readonly transport: Required<RedisTransport>;

  constructor(
    private readonly prefix: string,
    transport: RedisTransport,
  ) {
    if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix)) throw new Error("Invalid Redis namespace.");
    this.transport = createRedisExecution(transport);
  }

  async claim(scope: string, eventId: string): Promise<IdempotencyClaim> {
    const key = this.key(scope, eventId);
    const token = randomUUID();
    const reply = await this.transport.eval(
      IDEMPOTENCY_CLAIM_SCRIPT,
      [key],
      [token, String(IDEMPOTENCY_TTL_SECONDS)],
    );
    if (!Array.isArray(reply) || typeof reply[0] !== "string") {
      throw new Error("Redis temporarily unavailable.");
    }
    if (reply[0] === "claimed" && reply[1] === token) return { state: "claimed", token };
    if (reply[0] === "pending") return { state: "pending" };
    if (
      reply[0] === "completed" &&
      typeof reply[1] === "string" &&
      (reply[1] === "200" || reply[1] === "502")
    ) {
      return { state: "completed", status: Number(reply[1]) };
    }
    throw new Error("Redis temporarily unavailable.");
  }

  async complete(scope: string, eventId: string, token: string, status: number): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(token) || (status !== 200 && status !== 502)) {
      throw new Error("Invalid idempotency completion.");
    }
    const reply = await this.transport.eval(
      IDEMPOTENCY_COMPLETE_SCRIPT,
      [this.key(scope, eventId)],
      [token, String(status), String(IDEMPOTENCY_TTL_SECONDS)],
    );
    if (reply === 1 || reply === "1") return true;
    if (reply === 0 || reply === "0") return false;
    throw new Error("Redis temporarily unavailable.");
  }

  close() {
    this.transport.close();
  }

  private key(scope: string, eventId: string) {
    if (
      typeof scope !== "string" ||
      typeof eventId !== "string" ||
      !scope.length ||
      !eventId.length ||
      scope.length > 512 ||
      eventId.length > 512
    ) {
      throw new Error("Invalid idempotency key.");
    }
    const digest = createHash("sha256").update(scope).update("\0").update(eventId).digest("hex");
    return `${this.prefix}:webhook:${digest}`;
  }
}
