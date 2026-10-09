import { createHash } from "node:crypto";
import { createRedisExecution, type RedisTransport } from "./redis-execution.js";

export const SESSION_CREATE_SCRIPT = `
local result = redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX')
if result then return 1 end
return 0`;

export const SESSION_READ_SCRIPT = `return redis.call('GET', KEYS[1])`;

export const SESSION_UPDATE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`;

export const SESSION_REPLACE_SCRIPT = `
if KEYS[1] == KEYS[2] then return 0 end
local result = redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2], 'NX')
if not result then return 0 end
redis.call('DEL', KEYS[1])
return 1`;

export const SESSION_DELETE_SCRIPT = `return redis.call('DEL', KEYS[1])`;

/** Redis persistence for opaque, expiring application sessions; values remain owner-defined. */
export class RedisSessionStore {
  private readonly transport: Required<RedisTransport>;

  constructor(
    private readonly prefix: string,
    transport: RedisTransport,
  ) {
    if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix)) throw new Error("Invalid Redis namespace.");
    this.transport = createRedisExecution(transport);
  }

  async create(sessionId: string, value: string, seconds: number): Promise<boolean> {
    this.validate(sessionId, value, seconds);
    return this.isOne(
      await this.transport.eval(
        SESSION_CREATE_SCRIPT,
        [this.key(sessionId)],
        [value, String(seconds)],
      ),
    );
  }

  async get(sessionId: string): Promise<string | null> {
    this.validateSessionId(sessionId);
    const value = await this.transport.eval(SESSION_READ_SCRIPT, [this.key(sessionId)], []);
    if (value === null || typeof value === "string") return value;
    throw new Error("Redis temporarily unavailable.");
  }

  async update(
    sessionId: string,
    expectedValue: string,
    value: string,
    seconds: number,
  ): Promise<boolean> {
    this.validate(sessionId, value, seconds);
    if (!expectedValue || expectedValue.length > 4096) throw new Error("Invalid session value.");
    return this.isOne(
      await this.transport.eval(
        SESSION_UPDATE_SCRIPT,
        [this.key(sessionId)],
        [expectedValue, value, String(seconds)],
      ),
    );
  }

  async replace(
    previousSessionId: string,
    nextSessionId: string,
    value: string,
    seconds: number,
  ): Promise<boolean> {
    this.validate(previousSessionId, value, seconds);
    this.validateSessionId(nextSessionId);
    if (previousSessionId === nextSessionId) throw new Error("Session ids must be different.");
    return this.isOne(
      await this.transport.eval(
        SESSION_REPLACE_SCRIPT,
        [this.key(previousSessionId), this.key(nextSessionId)],
        [value, String(seconds)],
      ),
    );
  }

  async delete(sessionId: string): Promise<boolean> {
    this.validateSessionId(sessionId);
    const result = await this.transport.eval(SESSION_DELETE_SCRIPT, [this.key(sessionId)], []);
    if (result === 0 || result === "0") return false;
    if (result === 1 || result === "1") return true;
    throw new Error("Redis temporarily unavailable.");
  }

  close() {
    this.transport.close();
  }

  private key(sessionId: string) {
    const digest = createHash("sha256").update(sessionId).digest("hex");
    return `${this.prefix}:{sessions}:${digest}`;
  }

  private validate(sessionId: string, value: string, seconds: number) {
    this.validateSessionId(sessionId);
    if (!value || value.length > 4096) throw new Error("Invalid session value.");
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 7_776_000)
      throw new Error("Invalid session lifetime.");
  }

  private validateSessionId(sessionId: string) {
    if (typeof sessionId !== "string" || sessionId.length < 16 || sessionId.length > 256)
      throw new Error("Invalid session id.");
  }

  private isOne(result: unknown) {
    if (result === 1 || result === "1") return true;
    if (result === 0 || result === "0") return false;
    throw new Error("Redis temporarily unavailable.");
  }
}
