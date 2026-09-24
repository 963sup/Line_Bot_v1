import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { RedisTransport } from "../src/adapters/redis/redis-execution.js";
import {
  IDEMPOTENCY_CLAIM_SCRIPT,
  IDEMPOTENCY_COMPLETE_SCRIPT,
  IDEMPOTENCY_TTL_SECONDS,
  RedisIdempotencyStore,
} from "../src/adapters/redis/redis-idempotency-store.js";

test("idempotency claim hashes external identifiers and maps Lua states", async () => {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = [];
  const transport: RedisTransport = {
    eval: async (script, keys, args) => {
      calls.push({ script, keys, args });
      return ["claimed", args[0]!];
    },
  };
  const store = new RedisIdempotencyStore("line", transport);
  const claimed = await store.claim("group:private", "event-private");
  assert.equal(claimed.state, "claimed");
  if (claimed.state === "claimed") assert.match(claimed.token, /^[0-9a-f-]{36}$/i);
  assert.equal(calls[0]!.script, IDEMPOTENCY_CLAIM_SCRIPT);
  assert.match(calls[0]!.keys[0]!, /^line:webhook:[a-f0-9]{64}$/);
  assert.equal(calls[0]!.keys[0]!.includes("private"), false);
  assert.equal(calls[0]!.args[1], String(IDEMPOTENCY_TTL_SECONDS));

  transport.eval = async () => ["pending"];
  assert.deepEqual(await store.claim("scope", "event"), { state: "pending" });
  transport.eval = async () => ["completed", "502"];
  assert.deepEqual(await store.claim("scope", "event"), { state: "completed", status: 502 });
});

test("completion sends owner-token compare arguments and rejects stale ownership", async () => {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = [];
  const token = "00000000-0000-4000-8000-000000000000";
  const transport: RedisTransport = {
    eval: async (script, keys, args) => {
      calls.push({ script, keys, args });
      return 0;
    },
  };
  const store = new RedisIdempotencyStore("line", transport);
  assert.equal(await store.complete("scope", "event", token, 200), false);
  assert.equal(calls[0]!.script, IDEMPOTENCY_COMPLETE_SCRIPT);
  assert.deepEqual(calls[0]!.args, [token, "200", String(IDEMPOTENCY_TTL_SECONDS)]);

  transport.eval = async () => 1;
  assert.equal(await store.complete("scope", "event", token, 502), true);
  await assert.rejects(
    store.complete("scope", "event", token, 201),
    /Invalid idempotency completion/,
  );
  await assert.rejects(store.claim("", "event"), /Invalid idempotency key/);
});

test("injected idempotency transport keeps lifecycle, timeout and cooldown", async (context) => {
  let now = 100;
  const dateNow = mock.method(Date, "now", () => now);
  context.after(() => dateNow.mock.restore());
  let closed = 0;
  const transport: RedisTransport = {
    close: () => closed++,
    eval: () => new Promise(() => {}),
  };
  mock.timers.enable({ apis: ["setTimeout"] });
  context.after(() => mock.timers.reset());
  const store = new RedisIdempotencyStore("line", transport);
  const pending = store.claim("scope", "event");
  mock.timers.tick(2500);
  await assert.rejects(pending, /Redis temporarily unavailable/);
  assert.equal(closed, 0);
  transport.eval = async (_script, _keys, args) => ["claimed", args[0]!];
  await assert.rejects(store.claim("scope", "cooldown"), /Redis temporarily unavailable/);
  now = 5100;
  assert.equal((await store.claim("scope", "retry")).state, "claimed");
  assert.equal(closed, 0);
  store.close();
  assert.equal(closed, 1);
});
