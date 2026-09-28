import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeSentryEvent,
  sentryPrivacyOptions,
  serverSentryEnabled,
} from "../src/shared/observability/sentry-policy";
import { shouldCaptureHandledServerError } from "../src/shared/observability/server-error";

test("Sentry telemetry removes user, extra and request payload data", () => {
  const event = {
    type: undefined,
    user: { id: "private-user" },
    extra: { accountId: "private-account" },
    request: {
      url: "https://user:secret@example.com/api/issues/private-record?code=secret#token",
      method: "POST",
      headers: { authorization: "Bearer secret" },
      cookies: "session=secret",
      data: { employeeId: "private" },
      query_string: "code=secret",
      env: { AUTH_TOKEN: "secret" },
    },
    transaction: "/api/issues/private-record",
    exception: { values: [{ type: "Error", value: "unexpected failure" }] },
  };

  assert.deepEqual(sanitizeSentryEvent(event), {
    type: undefined,
    request: {
      method: "POST",
    },
    exception: { values: [{ type: "Error", value: "unexpected failure" }] },
  });
  assert.equal(event.request.url.includes("code=secret"), true);
  assert.equal(event.user.id, "private-user");
});

test("Sentry telemetry never emits request URLs or transactions with record identifiers", () => {
  for (const url of [
    "not-a-url",
    "file:///private/path",
    "https://example.com/expenses/private-id",
  ]) {
    assert.deepEqual(
      sanitizeSentryEvent({
        type: undefined,
        request: { url, method: "GET" },
        transaction: "/expenses/private-id",
      }),
      { type: undefined, request: { method: "GET" } },
    );
  }
});

test("Sentry data collection keeps frame-local and surrounding source values out of events", () => {
  const { dataCollection, maxBreadcrumbs } = sentryPrivacyOptions();
  assert.equal(maxBreadcrumbs, 0);
  assert.equal(dataCollection.stackFrameVariables, false);
  assert.equal(dataCollection.frameContextLines, 0);
});

test("handled server failures capture only 5xx responses", () => {
  for (const status of [400, 401, 403, 404, 409, 413, 429]) {
    assert.equal(shouldCaptureHandledServerError(status), false);
  }
  for (const status of [500, 502, 503, 504]) {
    assert.equal(shouldCaptureHandledServerError(status), true);
  }
});

test("server Sentry activation has one Vercel + DSN gate", () => {
  assert.equal(serverSentryEnabled({}), false);
  assert.equal(serverSentryEnabled({ VERCEL: "1" }), false);
  assert.equal(serverSentryEnabled({ NEXT_PUBLIC_SENTRY_DSN: "https://example.invalid/1" }), false);
  assert.equal(
    serverSentryEnabled({
      VERCEL: "1",
      NEXT_PUBLIC_SENTRY_DSN: "https://example.invalid/1",
    }),
    true,
  );
});
