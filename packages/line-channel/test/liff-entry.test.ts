import assert from "node:assert/strict";
import test from "node:test";
import { createLiffClient } from "../src/adapters/mini-app/browser/client.js";

test("LIFF callers share initialization, wait for SDK redirect and retry failures", async () => {
  let calls = 0;
  let login = 0;
  let href = "https://example.com/?liff.state=x";
  let fail = true;
  const client = createLiffClient(
    () => ({
      init: async () => {
        calls++;
        if (fail) throw new Error("private error");
      },
      isLoggedIn: () => false,
      login: () => {
        login++;
      },
      getAccessToken: () => null,
      getProfile: async () => ({ userId: "test", displayName: "test" }),
      isInClient: () => true,
      closeWindow: () => {},
      openWindow: () => {},
    }),
    () => href,
    () => "https://example.com/",
  );
  await assert.rejects(client.initialize("id"), /初始化失敗/);
  fail = false;
  assert.deepEqual(await Promise.all([client.initialize("id"), client.initialize("id")]), [
    false,
    false,
  ]);
  assert.equal(calls, 2);
  assert.equal(await client.session("id"), null);
  assert.equal(login, 0);
  href = "https://example.com/?membership=1";
  await client.session("id");
  assert.equal(login, 1);
  assert.equal(calls, 2);
  await assert.rejects(client.initialize("other"), /不一致/);
});
