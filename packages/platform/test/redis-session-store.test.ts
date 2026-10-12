import assert from "node:assert/strict";
import { test } from "node:test";
import type { RedisTransport } from "../src/redis/redis-execution.js";
import {
  RedisSessionStore,
  SESSION_CREATE_SCRIPT,
  SESSION_DELETE_SCRIPT,
  SESSION_READ_SCRIPT,
  SESSION_REPLACE_SCRIPT,
  SESSION_UPDATE_SCRIPT,
} from "../src/redis/redis-session-store.js";

test("session storage hashes opaque ids and uses atomic create, renew, replace and revoke scripts", async () => {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = [];
  const transport: RedisTransport = {
    eval: async (script, keys, args) => {
      calls.push({ script, keys, args });
      if (script === SESSION_READ_SCRIPT) return `record:${keys[0]}`;
      return 1;
    },
  };
  const store = new RedisSessionStore("line_bot_v1:test", transport);
  const id = "opaque-session-id-with-at-least-16-characters";
  const replacementId = "second-opaque-session-id-with-more-than-16-chars";

  assert.equal(await store.create(id, '{"subject":"U123"}', 3600), true);
  const stored = await store.get(id);
  assert.equal(await store.update(id, "old", "new", 3600), true);
  assert.equal(await store.replace(id, replacementId, "replacement", 3600), true);
  assert.equal(await store.delete(replacementId), true);

  const [createCall, readCall, updateCall, replaceCall, deleteCall] = calls;
  assert.ok(createCall);
  assert.ok(readCall);
  assert.ok(updateCall);
  assert.ok(replaceCall);
  assert.ok(deleteCall);
  assert.equal(stored, `record:${readCall.keys[0]}`);
  assert.equal(createCall.script, SESSION_CREATE_SCRIPT);
  assert.equal(updateCall.script, SESSION_UPDATE_SCRIPT);
  assert.equal(replaceCall.script, SESSION_REPLACE_SCRIPT);
  assert.equal(deleteCall.script, SESSION_DELETE_SCRIPT);
  for (const call of calls) {
    assert.ok(call.keys.every((key) => key.startsWith("line_bot_v1:test:{sessions}:")));
    assert.ok(call.keys.every((key) => !key.includes(id) && !key.includes(replacementId)));
  }
  assert.equal(createCall.keys[0], readCall.keys[0]);
  assert.notEqual(createCall.keys[0], replaceCall.keys[1]);
  assert.deepEqual(createCall.args, ['{"subject":"U123"}', "3600"]);
  assert.deepEqual(updateCall.args, ["old", "new", "3600"]);
  assert.deepEqual(replaceCall.args, ["replacement", "3600"]);
});

test("session storage rejects unsafe key and lifetime inputs before Redis access", async () => {
  let calls = 0;
  const store = new RedisSessionStore("line_bot_v1:test", {
    eval: async () => {
      calls++;
      return 1;
    },
  });
  await assert.rejects(() => store.create("short", "value", 60), /Invalid session id/);
  await assert.rejects(
    () => store.create("opaque-session-id-with-at-least-16-characters", "value", 0),
    /Invalid session lifetime/,
  );
  assert.equal(calls, 0);
});
