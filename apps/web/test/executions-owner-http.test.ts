import assert from "node:assert/strict";
import { test } from "node:test";
import { ExecutionError } from "@line_bot_v1/execution/domain/error";
import {
  type ExecutionWebRuntime,
  executionsRequest,
} from "../src/modules/execution/executions-http.server";

test("Executions HTTP preserves owner status and code", async () => {
  const error = new ExecutionError(409, "conflict", "CONFLICT");
  const fail = async () => {
    throw error;
  };
  const runtime: ExecutionWebRuntime = {
    scope: async () => ({
      actorUserId: "user",
      repository: { id: "repo", ownerLogin: "owner", name: "repo" },
      archived: false,
      canEdit: true,
      canManage: true,
    }),
    owner: () => ({ list: fail, read: fail, history: fail, execute: fail }),
    dependencies: () => ({ read: fail, execute: fail }),
  };
  const response = await executionsRequest(
    new Request(
      "https://app.example/api?owner=owner&name=repo&contractId=00000000-0000-4000-8000-000000000001",
    ),
    runtime,
    async () => "subject",
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "conflict", code: "CONFLICT" });
});

test("Executions HTTP dispatches dependency replacement to the dependency owner", async () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://app.example";
  let received: unknown;
  const fail = async () => {
    throw new Error("wrong owner");
  };
  const runtime: ExecutionWebRuntime = {
    scope: async () => ({
      actorUserId: "user",
      repository: { id: "repo", ownerLogin: "owner", name: "repo" },
      archived: false,
      canEdit: true,
      canManage: true,
    }),
    owner: () => ({ list: fail, read: fail, history: fail, execute: fail }),
    dependencies: () => ({
      read: fail,
      execute: async (actor, command) => {
        assert.equal(actor, "user");
        received = command;
        return {
          requestId: "request",
          revision: {
            id: "dependency-revision-1",
            repositoryId: "repo",
            planRevisionId: "plan",
            version: 1,
            parentRevisionId: null,
            actorUserId: "user",
            at: 1,
            edges: [],
          },
        };
      },
    }),
  };
  try {
    const response = await executionsRequest(
      new Request("https://app.example/api?owner=owner&name=repo", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({
          action: "replace-dependencies",
          repositoryId: "repo",
          planRevisionId: "plan",
          requestId: "request",
          expectedVersion: 0,
          edges: [],
        }),
      }),
      runtime,
      async () => "subject",
    );
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      action: "replace",
      repositoryId: "repo",
      planRevisionId: "plan",
      requestId: "request",
      expectedVersion: 0,
      edges: [],
    });
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});
