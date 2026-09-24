import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  createRedisExecution,
  type RedisTransport,
  RedisUnavailableError,
} from "../src/adapters/redis/redis-execution.js";
import { createUpstashRedisRestTransport } from "../src/adapters/redis/upstash-redis-rest.js";

test("Upstash REST transport requires HTTPS and sends EVAL without exposing credentials", async () => {
  assert.throws(
    () => createUpstashRedisRestTransport("http://redis.example", "token"),
    (error) => error instanceof RedisUnavailableError && error.code === "configuration",
  );
  assert.throws(
    () => createUpstashRedisRestTransport("https://redis.example", ""),
    (error) => error instanceof RedisUnavailableError && error.code === "configuration",
  );

  const requests: Array<{ url: string; headers: Headers; body: unknown }> = [];
  const transport = createUpstashRedisRestTransport(
    "https://redis.example/",
    "secret-token",
    async (input, init) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ result: 1 });
    },
  );
  assert.equal(await transport.eval("return 1", ["key"], ["arg"]), 1);
  assert.equal(requests[0]!.url, "https://redis.example/");
  assert.equal(requests[0]!.headers.get("authorization"), "Bearer secret-token");
  assert.deepEqual(requests[0]!.body, ["EVAL", "return 1", "1", "key", "arg"]);
});

test("Upstash REST maps provider failures to bounded non-secret codes", async () => {
  for (const [status, code] of [
    [401, "authentication"],
    [429, "provider_rate_limited"],
    [503, "provider_unavailable"],
    [400, "provider_error"],
  ] as const) {
    const transport = createUpstashRedisRestTransport(
      "https://redis.example",
      "token",
      async () => new Response(null, { status }),
    );
    await assert.rejects(
      transport.eval("return 1", [], []),
      (error) => error instanceof RedisUnavailableError && error.code === code,
    );
  }
  const invalid = createUpstashRedisRestTransport("https://redis.example", "token", async () =>
    Response.json({ ok: true }),
  );
  await assert.rejects(
    invalid.eval("return 1", [], []),
    (error) => error instanceof RedisUnavailableError && error.code === "invalid_response",
  );
});

test("Redis execution times out, cools down, then recovers without changing transport semantics", async (context) => {
  let now = 100;
  const dateNow = mock.method(Date, "now", () => now);
  context.after(() => dateNow.mock.restore());
  mock.timers.enable({ apis: ["setTimeout"] });
  context.after(() => mock.timers.reset());

  let calls = 0;
  const transport: RedisTransport = {
    eval: () => (++calls === 1 ? new Promise(() => {}) : Promise.resolve(1)),
  };
  const execution = createRedisExecution(transport);
  const pending = execution.eval("script", [], []);
  mock.timers.tick(2500);
  await assert.rejects(
    pending,
    (error) => error instanceof RedisUnavailableError && error.code === "timeout",
  );

  now = 200;
  await assert.rejects(
    execution.eval("script", [], []),
    (error) => error instanceof RedisUnavailableError && error.code === "cooldown",
  );
  assert.equal(calls, 1);

  now = 5100;
  assert.equal(await execution.eval("script", [], []), 1);
  assert.equal(calls, 2);
});

test("Redis execution preserves provider failure codes across cooldown", async (context) => {
  let now = 100;
  const dateNow = mock.method(Date, "now", () => now);
  context.after(() => dateNow.mock.restore());
  const transport: RedisTransport = {
    eval: async () => {
      throw new RedisUnavailableError("authentication");
    },
  };
  const execution = createRedisExecution(transport);
  await assert.rejects(
    execution.eval("script", [], []),
    (error) => error instanceof RedisUnavailableError && error.code === "authentication",
  );
  await assert.rejects(
    execution.eval("script", [], []),
    (error) => error instanceof RedisUnavailableError && error.code === "cooldown",
  );
});
