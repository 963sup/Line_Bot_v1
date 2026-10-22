import assert from "node:assert/strict";
import { test } from "node:test";
import type { createRepositorySubscription } from "@line_bot_v1/repository/application/subscription";
import { RepositoryError } from "@line_bot_v1/repository/contracts/errors/repository-error";
import {
  repositorySubscriptionCommandRequest,
  repositorySubscriptionViewRequest,
} from "../src/modules/repository/subscription-http.server";

type Subscription = ReturnType<typeof createRepositorySubscription>;

test("Repository subscription HTTP maps canonical selector and authenticated command", async () => {
  const calls: unknown[][] = [];
  const subscription: Pick<Subscription, "view" | "execute"> = {
    view: async (subject, selector) => {
      calls.push(["view", subject, selector]);
      return {
        repository: { id: "repo", actorUserId: "actor", ownerLogin: "octo", name: "Shared" },
        state: "UNSUBSCRIBED",
        version: 0,
      };
    },
    execute: async (subject, raw) => {
      calls.push(["execute", subject, raw]);
      return {
        requestId: "11111111-1111-4111-8111-111111111111",
        repositoryId: "repo",
        state: "SUBSCRIBED",
        version: 1,
        at: 10,
      };
    },
  };
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
  const subscription: Pick<Subscription, "view"> = {
    view: async () => {
      throw new RepositoryError(403, "forbidden");
    },
  };
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
