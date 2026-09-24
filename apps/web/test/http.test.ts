import assert from "node:assert/strict";
import { test } from "node:test";
import { UserError } from "@line-work/account/domain/user";
import { membershipFailureCode } from "../src/modules/account/failure-code.server";
import { apiError, readJsonBody } from "../src/modules/account/http.server";
import { BodyTooLargeError, jsonResponse, readBodyText } from "../src/shared/server/http";

test("shared HTTP responses retain status, error codes and private response headers", async () => {
  const response = jsonResponse({ value: 1 }, 202);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { value: 1 });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  for (const [status, code, retryable] of [
    [401, "session_expired", false],
    [403, "membership_denied", false],
    [409, "operation_conflict", false],
    [429, "rate_limited", true],
    [503, "service_unavailable", true],
    [400, "invalid_request", false],
  ] as const) {
    const result = apiError(new UserError(status, "公開錯誤"));
    assert.equal(result.status, status);
    assert.deepEqual(await result.json(), { error: "公開錯誤", code, retryable });
  }
  const unknown = apiError(new Error("internal-detail"));
  assert.equal(unknown.status, 503);
  assert.deepEqual(await unknown.json(), {
    error: "會員服務暫不可用（錯誤代碼：unknown）。請稍後重試。",
    code: "service_unavailable",
    retryable: true,
  });
});

test("membership failures expose useful diagnostics without leaking raw provider details", async () => {
  const postgres = Object.assign(new Error("relation private_table does not exist"), {
    code: "42P01",
  });
  assert.equal(membershipFailureCode(postgres), "postgres_42P01");
  assert.equal(
    membershipFailureCode(Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" })),
    "network_econnrefused",
  );
  assert.equal(
    membershipFailureCode(new Error("supabase_database_not_configured")),
    "database_not_configured",
  );
  assert.equal(
    membershipFailureCode(
      Object.assign(new Error("private upstream detail"), { code: "private-code" }),
    ),
    "unknown",
  );

  const response = apiError(postgres);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "會員服務暫不可用（錯誤代碼：postgres_42P01）。請稍後重試。",
    code: "service_unavailable",
    retryable: true,
  });
});

test("shared JSON reader retains fixed origin, content type, object and byte limits", async () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.test";
  const request = (
    body: string,
    origin = "https://example.test",
    contentType = "application/json",
  ) =>
    new Request("https://example.test/api/membership", {
      method: "POST",
      headers: { origin, "content-type": contentType },
      body,
    });
  try {
    assert.deepEqual(await readJsonBody(request("{}")), {});
    const boundary = JSON.stringify({ value: "x".repeat(2036) });
    assert.equal(Buffer.byteLength(boundary), 2048);
    assert.equal((await readJsonBody(request(boundary))).value, "x".repeat(2036));
    for (const [input, status] of [
      [request("{}", "https://other.test"), 403],
      [request("{}", "https://example.test", "text/plain"), 415],
      [request("[]"), 400],
      [request("null"), 400],
      [request("{"), 400],
      [request(JSON.stringify({ value: "界".repeat(683) })), 413],
    ] as const)
      await assert.rejects(
        readJsonBody(input),
        (error: unknown) => error instanceof UserError && error.status === status,
      );
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("bounded transport preserves byte boundaries, cancels overflow and propagates stream failures", async () => {
  for (const maxBytes of [2048, 8192]) {
    const input = "界".repeat(Math.floor(maxBytes / 3)) + "x".repeat(maxBytes % 3);
    const request = new Request("https://example.test", { method: "POST", body: input });
    assert.equal(Buffer.byteLength(input), maxBytes);
    assert.equal(await readBodyText(request, maxBytes), input);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(input));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const streamingRequest = { body } as Request;
    await assert.rejects(readBodyText(streamingRequest, maxBytes), BodyTooLargeError);
    assert.equal(cancelled, true);
  }
  const failure = new Error("stream failed");
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(failure);
    },
  });
  await assert.rejects(readBodyText({ body } as Request, 2048), (error) => error === failure);
});
