import assert from "node:assert/strict";
import { test } from "node:test";
import type { createRepositorySubscription } from "@line_bot_v1/repository/application/subscription";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import {
  repositorySubscriptionCommandRequest,
  repositorySubscriptionViewRequest,
} from "../src/modules/repository/subscription-http.server";

type Subscription = ReturnType<typeof createRepositorySubscription>;

test("Repository subscription HTTP maps canonical selector and authenticated command", async () => {
  const calls: unknown[][] = [];
  const subscription = {
    view: async (...args: unknown[]) => {
      calls.push(["view", ...args]);
      return { repository: { id: "repo", actorUserId: "actor" }, state: "UNSUBSCRIBED", version: 0 };
    },
    execute: async (...args: unknown[]) => {
      calls.push(["execute", ...args]);
      return { ok: true };
    },
  } as unknown as Subscription;
  const identity = async () => "subject";

  const view = await repositorySubscriptionViewRequest(
    new Request("https://example.com/api/repository-subscription?owner=octo&name=Shared"),
    subscription,
    identity,
  );
  assert.equal(view.status, 200);
  assert.deepEqual(calls[0], ["view", "subject", { ownerLogin: "octo", repositoryName: "Shared" }]);

  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  try {
    const command = {
      action: "set",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      expectedVersion: 0,
      state: "SUBSCRIBED",
    };
    const response = await repositorySubscriptionCommandRequest(
      new Request("https://example.com/api/repository-subscription", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify(command),
      }),
      subscription,
      identity,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls[1], ["execute", "subject", command]);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("Repository subscription HTTP fails closed on malformed selector and owner errors", async () => {
  const subscription = {
    view: async () => {
      throw new RepositoryError(403, "forbidden");
    },
  } as unknown as Subscription;
  const identity = async () => "subject";

  assert.equal(
    (
      await repositorySubscriptionViewRequest(
        new Request("https://example.com/api/repository-subscription?owner=octo&name=Shared"),
        subscription,
        identity,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await repositorySubscriptionViewRequest(
        new Request("https://example.com/api/repository-subscription?name=Shared"),
        subscription,
        identity,
      )
    ).status,
    400,
  );
});
