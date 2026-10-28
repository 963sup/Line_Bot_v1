import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpenseOperationError } from "@line_bot_v1/expense/contracts/dto/expense-failure";
import { ExpenseError } from "@line_bot_v1/expense/domain/aggregates/expense";
import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { GET, POST } from "../src/app/api/expenses/[id]/route";
import { createExpenseRequest } from "../src/modules/expense/api.server";
import { lineSessionHeaders } from "./line-session-fixture";
import {
  activateMember,
  closeFixture,
  expenseStore,
  memberStore,
  mockSupabase,
} from "./member-fixture";

test("Expense delivery maps owner reasons and keeps unknown outcomes private without retry", async () => {
  process.env.APP_ORIGIN = "https://app.example";
  let failure: Error = new Error("private write outcome");
  let writes = 0;
  const api = createExpenseRequest({
    requestIdentity: async () => "subject",
    getExpense: async () => {
      throw failure;
    },
    commandExpense: async () => {
      writes++;
      throw failure;
    },
    recognizeReceipt: async () => {
      throw failure;
    },
  });
  const id = "00000000-0000-0000-0000-000000000001";
  const context = { params: Promise.resolve({ id }) };
  const request = (
    body = JSON.stringify({ type: "cancel", revision: 1 }),
    contentType = "application/json",
    origin = "https://app.example",
  ) =>
    new Request(`https://app.example/api/expenses/${id}`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": contentType },
      body,
    });
  for (const [error, status] of [
    [new ExpenseError("invalid-fields", "owner rejection"), 400],
    [new ExpenseError("invalid-command", "owner rejection"), 400],
    [new ExpenseError("invalid-expense", "owner rejection"), 500],
    [new ExpenseError("version-conflict", "owner rejection"), 409],
    [new ExpenseError("terminal-conflict", "owner rejection"), 409],
    [new ExpenseOperationError("invalid-record", "owner rejection"), 500],
    [new ExpenseOperationError("recognition-conflict", "owner rejection"), 409],
    [new ExpenseOperationError("access-denied", "owner rejection"), 403],
    [new ExpenseOperationError("not-found", "owner rejection"), 404],
    [new ExpenseOperationError("recognition-cooldown", "owner rejection"), 429],
    [new ExpenseOperationError("not-a-receipt", "owner rejection"), 422],
    [new ExpenseOperationError("recognition-unavailable", "owner rejection"), 503],
  ] as const) {
    failure = error;
    const response = await api.GET(new Request(`https://app.example/api/expenses/${id}`), context);
    assert.equal(response.status, status, error.reason);
    assert.deepEqual(await response.json(), { error: "owner rejection" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const [input, status, message] of [
    [request("{}", "text/plain"), 415, "資料格式不正確。"],
    [request("x".repeat(8193)), 413, "資料過大。"],
    [request("{"), 400, "資料格式不正確。"],
    [request("{}"), 400, "缺少資料版本。"],
    [
      request("{}", "application/json", "https://evil.example"),
      403,
      "來源不符，請重新開啟操作頁。",
    ],
  ] as const) {
    const response = await api.POST(input, context);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: message });
  }
  assert.equal(writes, 0);
  failure = new Error("private write outcome");
  const unknown = await api.POST(request(), context);
  assert.equal(unknown.status, 503);
  assert.deepEqual(await unknown.json(), { error: "private write outcome" });
  assert.equal(writes, 1);
});

test("HTTP surface rejects anonymous, forged origin, other owner, invalid commands; success persists with zero chat calls", async () => {
  await mockSupabase();
  process.env.APP_ORIGIN = "https://app.example";
  const user = `U${"1".repeat(32)}`;
  process.env.LINE_PROVIDER_ID = "test-provider";
  const originalFetch = globalThis.fetch;
  let apiCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.line.me/oauth2/v2.1/verify?"))
      return Response.json({
        client_id: lineMiniApp("developing").channelId,
        expires_in: 30,
        scope: "profile",
      });
    if (url === "https://api.line.me/v2/profile") return Response.json({ userId: user });
    apiCalls++;
    throw new Error("Unexpected external side effect");
  };
  let authenticated: HeadersInit = {};
  const owner = await activateMember(user);
  const store = expenseStore();
  try {
    authenticated = await lineSessionHeaders("offline-token");
    await store.arm("group:A", owner);
    const d = await store.receive("group:A", owner, "1");
    assert.ok(d);
    const context = { params: Promise.resolve({ id: d.id }) };
    const request = (body?: unknown, origin = "https://app.example", auth = true) =>
      new Request(`https://app.example/api/expenses/${d.id}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(auth ? authenticated : {}),
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
    assert.deepEqual(Object.keys(view).sort(), [
      "amount",
      "createdAt",
      "currency",
      "date",
      "id",
      "invoiceNumber",
      "merchant",
      "number",
      "payment",
      "revision",
      "status",
    ]);
    assert.equal(view.number, d.number);
    assert.equal(view.owner, undefined);
    assert.equal(view.scope, undefined);
    assert.equal(view.imageId, undefined);
    assert.equal(view.project, undefined);
    const oversized = await POST(request({ revision: 1, padding: "x".repeat(8192) }), context);
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { error: "資料過大。" });
    assert.equal((await store.get(d.id, owner)).status, "pending");
    const otherOwner = await activateMember(`U${"2".repeat(32)}`);
    await store.arm("group:B", otherOwner);
    const other = await store.receive("group:B", otherOwner, "2");
    assert.ok(other);
    assert.equal((await GET(request(), { params: Promise.resolve({ id: other.id }) })).status, 404);

    assert.equal(
      (await POST(request({ type: "confirm", revision: d.revision, fields: {} }), context)).status,
      400,
    );
    assert.equal((await store.get(d.id, owner)).status, "pending");

    const fields = {
      merchant: "Demo",
      amount: "1260",
      currency: "TWD",
      date: "2026-09-06",
      invoiceNumber: "",
      payment: "advance",
    };
    const cmd = { type: "confirm", revision: d.revision, fields };
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
