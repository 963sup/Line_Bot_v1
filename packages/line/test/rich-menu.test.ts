import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createRichMenuClient, type RichMenuDefinition } from "../src/rich-menu/client.js";
import { richMenuImage } from "../src/rich-menu/image.js";

test("actual upload dimensions and malformed image rejection", () => {
  const directory = new URL("../../../assets/line/rich-menu/", import.meta.url);
  const files = [
    "line_bot_v1-attendance-in.jpg",
    "line_bot_v1-attendance-out.jpg",
    "line_bot_v1-forms.png",
    "line_bot_v1-incident.png",
    "line_bot_v1-notifications.png",
    "line_bot_v1-team.png",
  ];
  assert.deepEqual(readdirSync(directory).sort(), files);
  for (const file of files) {
    const image = readFileSync(new URL(file, directory));
    const size = richMenuImage(image);
    assert.ok(size.width >= 800 && size.width <= 2500, file);
    assert.equal(size.mimeType, file.endsWith(".jpg") ? "image/jpeg" : "image/png", file);
    assert.throws(() => richMenuImage(image.subarray(0, 10)), file);
  }
  const oversizedPng = new Uint8Array(1_500_000);
  oversizedPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  oversizedPng.set([0x49, 0x48, 0x44, 0x52], 12);
  const oversizedHeader = new DataView(oversizedPng.buffer);
  oversizedHeader.setUint32(16, 1280);
  oversizedHeader.setUint32(20, 853);
  assert.deepEqual(richMenuImage(oversizedPng), {
    width: 1280,
    height: 853,
    mimeType: "image/png",
  });
});

test("rich menu client keeps its existing public method surface", () => {
  const client = createRichMenuClient("test", async () => new Response(null, { status: 200 }));
  assert.deepEqual(Object.keys(client), [
    "validate",
    "create",
    "upload",
    "get",
    "delete",
    "getAlias",
    "createAlias",
    "updateAlias",
    "deleteAlias",
    "getUserMenu",
    "getDefault",
    "activate",
    "deleteDefault",
    "linkUser",
  ]);
});

test("menu operations preserve official paths, methods, payloads and response IDs", async () => {
  const requests: Request[] = [];
  const menu: RichMenuDefinition = {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: "test",
    chatBarText: "test",
    areas: [],
  };
  const client = createRichMenuClient("test", async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "POST" && request.url.endsWith("/richmenu")) {
      return Response.json({ richMenuId: "richmenu-0123abcd" });
    }
    if (request.method === "GET") return Response.json({ name: "test" });
    return new Response(null, { status: 200 });
  });

  await client.validate(menu);
  assert.equal(requests[0]?.method, "POST");
  assert.equal(requests[0]?.url, "https://api.line.me/v2/bot/richmenu/validate");

  assert.deepEqual(await client.create(menu), { richMenuId: "richmenu-0123abcd" });
  assert.equal(requests[1]?.method, "POST");
  assert.equal(requests[1]?.url, "https://api.line.me/v2/bot/richmenu");
  assert.deepEqual(await requests[1]!.json(), menu);

  assert.deepEqual(await client.get("richmenu-0123abcd"), { name: "test" });
  assert.equal(requests[2]?.method, "GET");
  assert.equal(requests[2]?.url, "https://api.line.me/v2/bot/richmenu/richmenu-0123abcd");
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
    new URL("../../../assets/line/rich-menu/line_bot_v1-attendance-in.jpg", import.meta.url),
  );
  await client.upload("richmenu-0123abcd", image);
  assert.equal(requests[0]?.headers.get("content-type"), "image/jpeg");
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
  await client.createAlias("line_bot_v1-home", "richmenu-0123abcd");
  assert.equal(requests[0]?.url, "https://api.line.me/v2/bot/richmenu/alias");
  assert.deepEqual(await requests[0]!.json(), {
    richMenuAliasId: "line_bot_v1-home",
    richMenuId: "richmenu-0123abcd",
  });
  assert.equal(await client.getAlias("line_bot_v1-home"), "richmenu-0123abcd");
  await client.updateAlias("line_bot_v1-home", "richmenu-0123abcd");
  assert.equal(requests[2]?.url, "https://api.line.me/v2/bot/richmenu/alias/line_bot_v1-home");
  assert.equal(requests[2]?.method, "POST");
  assert.deepEqual(await requests[2]!.json(), { richMenuId: "richmenu-0123abcd" });
  await client.deleteAlias("line_bot_v1-home");
  assert.equal(requests[3]?.url, "https://api.line.me/v2/bot/richmenu/alias/line_bot_v1-home");
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
