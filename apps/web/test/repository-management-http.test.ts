import assert from "node:assert/strict";
import { test } from "node:test";
import type { createRepositoryManagement } from "@line_bot_v1/repository/application/management";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import {
  repositoryManagementCommandRequest,
  repositoryManagementViewRequest,
} from "../src/modules/repository/management-http.server";

type Management = ReturnType<typeof createRepositoryManagement>;

test("Repository management HTTP maps canonical selector and authenticated command", async () => {
  const calls: unknown[][] = [];
  const management = {
    view: async (...args: unknown[]) => {
      calls.push(["view", ...args]);
      return { repository: { id: "repo", actorUserId: "actor" } };
    },
    execute: async (...args: unknown[]) => {
      calls.push(["execute", ...args]);
      return { ok: true };
    },
  } as unknown as Management;
  const identity = async () => "subject";

  const view = await repositoryManagementViewRequest(
    new Request("https://example.com/api/repository-management?owner=octo&name=Shared"),
    management,
    identity,
  );
  assert.equal(view.status, 200);
  assert.deepEqual(calls[0], ["view", "subject", { ownerLogin: "octo", repositoryName: "Shared" }]);

  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  try {
    const command = {
      action: "archive",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      expectedVersion: 2,
    };
    const response = await repositoryManagementCommandRequest(
      new Request("https://example.com/api/repository-management", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify(command),
      }),
      management,
      identity,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls[1], ["execute", "subject", command]);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("Repository management HTTP fails closed on malformed selector and owner errors", async () => {
  const management = {
    view: async () => {
      throw new RepositoryError(403, "forbidden");
    },
  } as unknown as Management;
  const identity = async () => "subject";

  assert.equal(
    (
      await repositoryManagementViewRequest(
        new Request("https://example.com/api/repository-management?owner=octo&name=Shared"),
        management,
        identity,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await repositoryManagementViewRequest(
        new Request("https://example.com/api/repository-management?owner=octo"),
        management,
        identity,
      )
    ).status,
    400,
  );
});
