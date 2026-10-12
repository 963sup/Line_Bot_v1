import assert from "node:assert/strict";
import { test } from "node:test";
import type { RedisTransport } from "../src/redis/redis-execution.js";
import { RedisRateLimiter } from "../src/redis/redis-rate-limiter.js";

test("rate limiter keeps namespace, atomic script arguments and hashed identity", async () => {
  const calls: Array<{ keys: string[]; args: string[] }> = [];
  const transport: RedisTransport = {
    eval: async (_script, keys, args) => {
      calls.push({ keys, args });
      return calls.length === 1 ? 1 : 0;
    },
  };
  const limiter = new RedisRateLimiter("line", transport);
  assert.equal(await limiter.allow("membership", "line-user", 20, 3, 60), true);
  assert.equal(await limiter.allow("membership", "line-user", 20, 3, 60), false);
  const firstCall = calls[0];
  assert.ok(firstCall);
  const [globalKey, identityKey] = firstCall.keys;
  assert.ok(globalKey);
  assert.ok(identityKey);
  assert.deepEqual(firstCall.args, ["20", "3", "60"]);
  assert.match(globalKey, /^line:\{membership\}:global$/);
  assert.match(identityKey, /^line:\{membership\}:[a-f0-9]{64}$/);
  assert.equal(identityKey.includes("line-user"), false);
});
