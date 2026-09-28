import assert from "node:assert/strict";
import { test } from "node:test";
import type { createRepositoryAddress } from "@line_bot_v1/repository/application/address";
import { RepositoryError } from "@line_bot_v1/repository/domain";
import {
  repositoryAddressCommandRequest,
  repositoryAddressViewRequest,
} from "../src/modules/repository/address-http.server";

type RepositoryAddressService = ReturnType<typeof createRepositoryAddress>;

test("Repository address HTTP translates canonical selector and authenticated command", async () => {
  const calls: unknown[][] = [];
  const address = {
    view: async (...args: unknown[]) => {
      calls.push(["view", ...args]);
      return {
        repository: {
          id: "repo",
          actorUserId: "actor",
          ownerLogin: "octo",
          name: "Shared",
          version: 1,
          actorCapability: "admin",
        },
        address: null,
      };
    },
    execute: async (...args: unknown[]) => {
      calls.push(["execute", ...args]);
      return { ok: true };
    },
  } as unknown as RepositoryAddressService;
  const identity = async () => "subject";

  const view = await repositoryAddressViewRequest(
    new Request("https://example.com/api/repository-address?owner=octo&name=Shared"),
    address,
    identity,
  );
  assert.equal(view.status, 200);
  assert.deepEqual(calls[0], ["view", "subject", { ownerLogin: "octo", repositoryName: "Shared" }]);

  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  try {
    const command = {
      action: "remove",
      requestId: "11111111-1111-4111-8111-111111111111",
      repositoryId: "repo",
      expectedVersion: 2,
    };
    const response = await repositoryAddressCommandRequest(
      new Request("https://example.com/api/repository-address", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "application/json" },
        body: JSON.stringify(command),
      }),
      address,
      identity,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(calls[1], ["execute", "subject", command]);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("Repository address HTTP fails closed on malformed selectors and owner errors", async () => {
  const address = {
    view: async () => {
      throw new RepositoryError(403, "forbidden");
    },
  } as unknown as RepositoryAddressService;
  const identity = async () => "subject";
  const forbidden = await repositoryAddressViewRequest(
    new Request("https://example.com/api/repository-address?owner=octo&name=Shared"),
    address,
    identity,
  );
  assert.equal(forbidden.status, 403);

  const malformed = await repositoryAddressViewRequest(
    new Request("https://example.com/api/repository-address?owner=octo"),
    address,
    identity,
  );
  assert.equal(malformed.status, 400);

  const invalidPath = await repositoryAddressViewRequest(
    new Request("https://example.com/api/repository-address?owner=bad%20owner&name=Shared"),
    address,
    identity,
  );
  assert.equal(invalidPath.status, 400);
});
