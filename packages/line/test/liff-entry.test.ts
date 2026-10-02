import assert from "node:assert/strict";
import test from "node:test";
import { createLiffBoot, type LiffSdk } from "../src/liff/boot.js";
import { createLiffClient } from "../src/liff/client.js";

test("LIFF boot starts immediately, shares initialization, waits for redirect and retries failures", async () => {
  let calls = 0;
  let login = 0;
  let href = "https://example.com/?liff.state=x";
  let fail = true;
  const sdk: LiffSdk = {
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
  };

  const boot = createLiffBoot(sdk, "id");
  assert.equal(calls, 1, "liff.init starts during boot creation, before any UI observer");
  await assert.rejects(boot.ready(), /初始化失敗/);

  fail = false;
  const client = createLiffClient(boot, () => href, () => "https://example.com/");
  assert.deepEqual(await Promise.all([client.initialize("id"), client.initialize("id")]), [
    false,
    false,
  ]);
  assert.equal(calls, 2, "concurrent consumers share one retry attempt");

  assert.equal(await client.session("id"), null);
  assert.equal(login, 0, "liff.state stays pending until the SDK redirect is complete");

  href = "https://example.com/?membership=1";
  await client.session("id");
  assert.equal(login, 1);
  assert.equal(calls, 2);
  await assert.rejects(client.initialize("other"), /不一致/);
});
