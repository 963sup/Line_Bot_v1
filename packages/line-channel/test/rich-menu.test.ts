import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createRichMenuClient } from "../src/adapters/messaging/rich-menu-client.js";
import { richMenuImage } from "../src/adapters/messaging/rich-menu-image.js";

test("actual upload dimensions and malformed image rejection", () => {
  const directory = new URL("../../../assets/line/rich-menu/", import.meta.url);
  const files = [
    "work-assistant-attendance-in.png",
    "work-assistant-attendance-out.png",
    "work-assistant-forms.png",
    "work-assistant-incident.png",
    "work-assistant-notifications.png",
    "work-assistant-team.png",
  ];
  assert.deepEqual(readdirSync(directory).sort(), files);
  for (const file of files) {
    const image = readFileSync(new URL(file, directory));
    const size = richMenuImage(image);
    assert.ok(size.width >= 800 && size.width <= 2500, file);
    assert.equal(size.mimeType, "image/png", file);
    assert.throws(() => richMenuImage(image.subarray(0, 10)), file);
  }
  assert.throws(() => richMenuImage(new Uint8Array(1000001)));
});

test("default absence is distinct from API failure; no retry or error-body exposure", async () => {
  let calls = 0;
  const client = createRichMenuClient("test", async () => {
    calls++;
    return new Response("private data", { status: 503 });
  });
  await assert.rejects(client.getDefault(), /HTTP 503/);
  assert.equal(calls, 1);
  const missing = createRichMenuClient("test", async () => new Response(null, { status: 404 }));
  assert.equal(await missing.getDefault(), null);
  assert.throws(() => client.activate("../bad"), /Invalid/);
});

test("linking a user validates both identifiers and sends one official request", async () => {
  const requests: Request[] = [];
  const client = createRichMenuClient("test", async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  });
  await client.linkUser("U0123456789abcdef0123456789abcdef", "richmenu-0123abcd");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "POST");
  assert.equal(
    requests[0]?.url,
    "https://api.line.me/v2/bot/user/U0123456789abcdef0123456789abcdef/richmenu/richmenu-0123abcd",
  );
  await assert.rejects(client.linkUser("not-a-user", "richmenu-0123abcd"), /Invalid LINE user ID/);
});

test("upload uses the MIME type detected from image bytes", async () => {
  const requests: Request[] = [];
  const client = createRichMenuClient("test", async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  });
  const image = readFileSync(
    new URL("../../../assets/line/rich-menu/work-assistant-attendance-in.png", import.meta.url),
  );
  await client.upload("richmenu-0123abcd", image);
  assert.equal(requests[0]?.headers.get("content-type"), "image/png");
});

test("rich menu recovery endpoints validate IDs and use official delete requests", async () => {
  const requests: Request[] = [];
  const client = createRichMenuClient("test", async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(null, { status: 200 });
  });
  await client.delete("richmenu-0123abcd");
  assert.equal(requests[0]?.method, "DELETE");
  assert.equal(requests[0]?.url, "https://api.line.me/v2/bot/richmenu/richmenu-0123abcd");
  await client.deleteDefault();
  assert.equal(requests[1]?.method, "DELETE");
  assert.equal(requests[1]?.url, "https://api.line.me/v2/bot/user/all/richmenu");
  assert.throws(() => client.delete("../bad"), /Invalid rich menu ID/);
});

test("aliases use official endpoints and reject malformed identifiers", async () => {
  const requests: Request[] = [];
  const client = createRichMenuClient("test", async (input, init) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify({ richMenuId: "richmenu-0123abcd" }), { status: 200 });
  });
  await client.createAlias("work-assistant-home", "richmenu-0123abcd");
  assert.equal(requests[0]?.url, "https://api.line.me/v2/bot/richmenu/alias");
  assert.deepEqual(await requests[0]!.json(), {
    richMenuAliasId: "work-assistant-home",
    richMenuId: "richmenu-0123abcd",
  });
  assert.equal(await client.getAlias("work-assistant-home"), "richmenu-0123abcd");
  await client.updateAlias("work-assistant-home", "richmenu-0123abcd");
  assert.equal(requests[2]?.url, "https://api.line.me/v2/bot/richmenu/alias/work-assistant-home");
  assert.equal(requests[2]?.method, "POST");
  assert.deepEqual(await requests[2]!.json(), { richMenuId: "richmenu-0123abcd" });
  await client.deleteAlias("work-assistant-home");
  assert.equal(requests[3]?.url, "https://api.line.me/v2/bot/richmenu/alias/work-assistant-home");
  assert.equal(requests[3]?.method, "DELETE");
  assert.equal(await client.getUserMenu("U0123456789abcdef0123456789abcdef"), "richmenu-0123abcd");
  assert.equal(requests[4]?.method, "GET");
  assert.equal(
    requests[4]?.url,
    "https://api.line.me/v2/bot/user/U0123456789abcdef0123456789abcdef/richmenu",
  );
  await assert.rejects(client.getUserMenu("invalid"), /Invalid/);
  await assert.rejects(client.updateAlias("../bad", "richmenu-0123abcd"), /Invalid/);
  await assert.rejects(client.createAlias("../bad", "richmenu-0123abcd"), /Invalid/);
  await assert.rejects(client.deleteAlias("../bad"), /Invalid/);
});
