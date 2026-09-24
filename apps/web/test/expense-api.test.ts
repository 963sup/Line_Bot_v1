import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, POST } from "../src/app/api/expenses/[id]/route";
import { lineMiniApp } from "../src/shared/server/line-mini-app";
import {
  activateMember,
  closeFixture,
  expenseStore,
  memberStore,
  mockSupabase,
} from "./member-fixture";

test("HTTP surface rejects anonymous, forged origin, other owner, invalid commands; success persists with zero chat calls", async () => {
  await mockSupabase();
  process.env.APP_ORIGIN = "https://app.example";
  const user = `U${"1".repeat(32)}`;
  process.env.LINE_PROVIDER_ID = "test-provider";
  const originalFetch = globalThis.fetch;
  let apiCalls = 0;
  globalThis.fetch = (async (input) => {
    apiCalls++;
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?"))
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 30,
        scope: "profile",
      });
    if (url === "https://api.line.me/v2/profile") return Response.json({ userId: user });
    throw new Error("Unexpected external side effect");
  }) as typeof fetch;
  const owner = await activateMember(user);
  const store = expenseStore();
  try {
    await store.arm("group:A", owner);
    const d = (await store.receive("group:A", owner, "1"))!;
    const context = { params: Promise.resolve({ id: d.id }) };
    const request = (body?: unknown, origin = "https://app.example", auth = true) =>
      new Request(`https://app.example/api/expenses/${d.id}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(auth ? { "X-Line-Token": "offline-token" } : {}),
          Origin: origin,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await GET(request(undefined, "", false), context)).status, 401);
    assert.equal(apiCalls, 0);
    assert.equal(
      (await POST(request({ type: "cancel", revision: 1 }, "https://evil.example"), context))
        .status,
      403,
    );
    assert.equal(apiCalls, 0);
    const memberId = owner;
    const view = await (await GET(request(), context)).json();
    assert.equal(view.number, d.number);
    assert.equal(view.owner, undefined);
    assert.equal(view.scope, undefined);
    assert.equal(view.imageId, undefined);
    const oversized = await POST(request({ revision: 1, padding: "x".repeat(8192) }), context);
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "資料過大。" });
    assert.equal((await store.get(d.id, owner)).status, "pending");
    const otherOwner = await activateMember(`U${"2".repeat(32)}`);
    await store.arm("group:B", otherOwner);
    const other = (await store.receive("group:B", otherOwner, "2"))!;
    assert.equal((await GET(request(), { params: Promise.resolve({ id: other.id }) })).status, 404);
    const draft = await store.recognized(d.id, owner, 1, {
      isReceipt: true,
      merchant: "Demo",
      amount: "1260",
      currency: "TWD",
      date: "2026-09-06",
      invoiceNumber: null,
      uncertainFields: [],
    });
    assert.equal(
      (await POST(request({ type: "confirm", revision: draft.revision, fields: {} }), context))
        .status,
      400,
    );
    const fields = {
      merchant: "Demo",
      amount: "1260",
      currency: "TWD",
      date: "2026-09-06",
      invoiceNumber: "",
      project: "富士",
      payment: "advance",
    };
    const cmd = { type: "confirm", revision: draft.revision, fields };
    assert.equal((await POST(request(cmd), context)).status, 200);
    assert.equal((await POST(request(cmd), context)).status, 200);
    assert.equal((await store.get(d.id, owner)).status, "confirmed");
    await memberStore().suspend(memberId);
    assert.equal((await POST(request({ type: "cancel", revision: 1 }), context)).status, 403);
  } finally {
    globalThis.fetch = originalFetch;
    await closeFixture();
  }
});
