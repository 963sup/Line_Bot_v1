import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeMeasuredPageTelemetryEvent } from "../src/shared/browser/telemetry";

test("telemetry strips URL credentials, parameters, fragments and sensitive route values", () => {
  assert.deepEqual(
    sanitizeMeasuredPageTelemetryEvent({
      type: "vital",
      url: "https://user:secret@example.com/expenses?id=private&ticket=secret#token",
      route: "/expenses?ticket=secret",
    }),
    { type: "vital", url: "https://example.com/expenses", route: "/expenses" },
  );
});

test("telemetry rejects callbacks, unknown paths and malformed URLs", () => {
  for (const url of [
    "https://example.com/settingsmbership/google-result?code=secret",
    "https://example.com/api/auth/line",
    "https://example.com/expenses/private-id",
    "https://example.com/acme/operations/issues/33333333-3333-4333-8333-333333333333",
    "https://example.com/notifications/private-id",
    "invalid",
  ]) {
    assert.equal(sanitizeMeasuredPageTelemetryEvent({ url }), null);
  }
});

test("primary MINI App pages retain only aggregate paths", () => {
  for (const path of [
    "/home",
    "/settings",
    "/attendance",
    "/repositories",
    "/team",
    "/partners",
    "/notifications",
  ]) {
    assert.deepEqual(
      sanitizeMeasuredPageTelemetryEvent({
        url: `https://example.com${path}?code=secret&group=private#access_token`,
        route: `${path}?group=private`,
      }),
      { url: `https://example.com${path}`, route: path },
    );
  }
});

test("telemetry keeps aggregate page views without mutating the original", () => {
  assert.deepEqual(
    sanitizeMeasuredPageTelemetryEvent({
      url: "https://example.com/settings?google=link#secret",
    }),
    { url: "https://example.com/settings" },
  );
  const event = { type: "pageview", url: "https://example.com/expenses?ticket=secret" };
  assert.deepEqual(sanitizeMeasuredPageTelemetryEvent(event), {
    type: "pageview",
    url: "https://example.com/expenses",
  });
  assert.ok(event.url.includes("ticket"));
});
