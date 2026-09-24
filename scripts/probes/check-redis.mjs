import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { loadRootEnv } from "../runtime/load-env.mjs";

const appRequire = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createUpstashRedisRestTransport, RedisIdempotencyStore, RedisRateLimiter } = await import(
  appRequire.resolve("@line-work/platform/adapters/redis")
);

let command, one, two, firstStore, secondStore, idempotencyKey;
try {
  loadRootEnv();
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw Error("Vercel Marketplace Redis REST is not configured");

  const firstTransport = createUpstashRedisRestTransport(url, token);
  const secondTransport = createUpstashRedisRestTransport(url, token);
  command = firstTransport.command;
  const prefix = `line-bot:probe:${randomUUID()}`;
  one = new RedisRateLimiter(prefix, firstTransport);
  two = new RedisRateLimiter(prefix, secondTransport);

  const samples = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    assert.equal(await command(["PING"]), "PONG");
    samples.push(performance.now() - start);
  }

  const key = `${prefix}:value`;
  assert.equal(await command(["SET", key, "synthetic-test", "EX", "10"]), "OK");
  assert.equal(await command(["GET", key]), "synthetic-test");
  assert.ok(Number(await command(["TTL", key])) > 0);
  assert.equal(Number(await command(["DEL", key])), 1);

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? one : two).allow("shared", "synthetic-user", 20, 3, 2),
    ),
  );
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal(await one.allow("global", "first", 1, 10, 2), true);
  assert.equal(await two.allow("global", "second", 1, 10, 2), false);
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.equal(await two.allow("shared", "synthetic-user", 20, 3, 2), true);

  firstStore = new RedisIdempotencyStore(prefix, firstTransport);
  secondStore = new RedisIdempotencyStore(prefix, secondTransport);
  const scope = "synthetic-channel";
  const eventId = "synthetic-event";
  idempotencyKey = `${prefix}:webhook:${createHash("sha256")
    .update(scope)
    .update("\0")
    .update(eventId)
    .digest("hex")}`;
  const claims = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      (index % 2 ? firstStore : secondStore).claim(scope, eventId),
    ),
  );
  const winner = claims.find((claim) => claim.state === "claimed");
  assert.equal(claims.filter((claim) => claim.state === "claimed").length, 1);
  assert.equal(claims.filter((claim) => claim.state === "pending").length, 9);
  const leaseTtl = Number(await command(["TTL", idempotencyKey]));
  assert.ok(leaseTtl > 0 && leaseTtl <= 600);
  assert.equal(await secondStore.complete(scope, eventId, randomUUID(), 200), false);
  assert.equal(await firstStore.complete(scope, eventId, winner.token, 502), true);
  assert.deepEqual(await secondStore.claim(scope, eventId), { state: "completed", status: 502 });
  assert.ok(Number(await command(["TTL", idempotencyKey])) > 0);

  await command(["PEXPIRE", idempotencyKey, "20"]);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const replacement = await secondStore.claim(scope, eventId);
  assert.equal(replacement.state, "claimed");
  assert.equal(await firstStore.complete(scope, eventId, winner.token, 200), false);
  assert.equal(await secondStore.complete(scope, eventId, replacement.token, 200), true);
  assert.deepEqual(await firstStore.claim(scope, eventId), { state: "completed", status: 200 });
  assert.equal(Number(await command(["DEL", idempotencyKey])), 1);
  idempotencyKey = undefined;

  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      ok: true,
      transport: "vercel-marketplace-rest",
      pingSamples: 10,
      pingMedianMs: Number(samples[5].toFixed(1)),
      pingMaxMs: Number(samples[9].toFixed(1)),
      setGetTtlDelete: true,
      concurrentAllowed: 3,
      concurrentRequests: 10,
      sharedGlobalLimit: true,
      expiryRecovery: true,
      idempotencySingleWinner: true,
      idempotencyCrossClientReplay: true,
      idempotencyStaleOwnerRejected: true,
      idempotencyExpiryRecovery: true,
    }),
  );
} catch {
  console.error("Redis verification failed. Credentials and remote error details omitted.");
  process.exitCode = 1;
} finally {
  one?.close();
  two?.close();
  firstStore?.close();
  secondStore?.close();
  if (idempotencyKey && command) await command(["DEL", idempotencyKey]).catch(() => {});
}
