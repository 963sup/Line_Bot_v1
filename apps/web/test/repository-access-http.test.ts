import assert from "node:assert/strict";
import { test } from "node:test";
import type { createRepositoryAccess } from "@line_bot_v1/repository/application/access";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import {
  repositoryAccessCommandRequest,
  repositoryAccessViewRequest,
} from "../src/modules/repository/access-http.server";

type RepositoryAccess = ReturnType<typeof createRepositoryAccess>;

test("Repository access HTTP translates owner/name and authenticated command transport", async () => {
  const calls: unknown[][] = [];
  const access = {
    view: async (...args: unknown[]) => {
      calls.push(["view", ...args]);
      return {
        repository: {
          id: "repo",
          ownerAccountId: "org",
          ownerKind: "ORGANIZATION",
          ownerLogin: "octo",
          name: "Shared",
          actorCapability: "admin",
        },
        directUserGrants: [],
        teamGrants: [],
      };
    },
    execute: async (...args: unknown[]) => {
      calls.push(["execute", ...args]);
      return { ok: true };
    },
  } as unknown as RepositoryAccess;
  const identity = async () => "subject";

  const view = await repositoryAccessViewRequest(
    new Request("https://example.com/api/repository-access?owner=octo&name=Shared"),
    access,
    identity,
  );
  assert.equal(view.status, 200);
  assert.deepEqual(calls[0], [
    "view",
    "subject",
    { ownerLogin: "octo", repositoryName: "Shared" },
  ]);

  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  try {
    const command = {
      action: "grant",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      subjectKind: "USER",
      subjectId: "member",
      capability: "read",
      expectedVersion: 0,
    };
    const response = await repositoryAccessCommandRequest(
      new Request("https://example.com/api/repository-access", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify(command),
      }),
      access,
      identity,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls[1], ["execute", "subject", command]);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("Repository access HTTP fails closed on malformed selectors and owner errors", async () => {
  const access = {
    view: async () => {
      throw new RepositoryError(403, "forbidden");
    },
  } as unknown as RepositoryAccess;
  const identity = async () => "subject";
  const forbidden = await repositoryAccessViewRequest(
    new Request("https://example.com/api/repository-access?owner=octo&name=Shared"),
    access,
    identity,
  );
  assert.equal(forbidden.status, 403);

  const malformed = await repositoryAccessViewRequest(
    new Request("https://example.com/api/repository-access?owner=octo"),
    access,
    identity,
  );
  assert.equal(malformed.status, 503);
});
