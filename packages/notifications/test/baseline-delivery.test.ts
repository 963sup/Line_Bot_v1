import assert from "node:assert/strict";
import { test } from "node:test";
import { createBaselineNotifications } from "../src/application/use-cases/baseline-delivery.js";
import { deliveryRetry, lineRetryWindow } from "../src/domain/delivery.js";

test("retry policy backs off but never schedules beyond the 23 hour boundary", () => {
  assert.equal(deliveryRetry(1, 100, 100), 2100);
  assert.equal(deliveryRetry(100, 100, 100), 3600100);
  assert.equal(deliveryRetry(1, lineRetryWindow - 1000, 0), null);
});
test("revoked execution prevents Inbox creation and sending", async () => {
  let effects = 0;
  const notifications = createBaselineNotifications({
    store: {
      create: async () => {
        effects++;
      },
      claim: async () => {
        throw new Error("unexpected");
      },
      complete: async () => {
        throw new Error("unexpected");
      },
      cancel: async () => {},
    },
    send: async () => {
      effects++;
      return "accepted";
    },
    inboxUrl: "https://example.test/notifications",
    now: () => 1,
  });
  const result = await notifications.deliver(
    { key: "test", repositoryId: "repo", baselineId: "b", revisionId: "r", recipient: "user" },
    async () => false,
  );
  assert.equal(effects, 0);
  assert.equal(result.line, "cancelled");
  assert.equal(result.inbox, "skipped");
});
test("an executor that loses its parent lease cannot save a provider result", async () => {
  let checks = 0,
    completions = 0;
  const notifications = createBaselineNotifications({
    store: {
      create: async () => {},
      claim: async () => ({
        result: { inbox: "created", notificationId: "notification", line: "unknown", nextAt: null },
        claim: {
          token: "lease",
          key: "intent",
          target: "target",
          payload: "payload",
          retryKey: "retry",
        },
      }),
      complete: async () => {
        completions++;
        throw new Error("unexpected");
      },
      cancel: async () => {},
    },
    send: async () => "accepted",
    inboxUrl: "https://example.test/notifications",
    now: () => 1,
  });
  const result = await notifications.deliver(
    { key: "intent", repositoryId: "repo", baselineId: "b", revisionId: "r", recipient: "user" },
    async () => ++checks < 3,
  );
  assert.equal(result.line, "stale");
  assert.equal(completions, 0);
});
