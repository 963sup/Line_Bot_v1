import assert from "node:assert/strict";
import { test } from "node:test";
import { ResourceError } from "@line_bot_v1/resources/domain/resource-error";
import {
  type ResourceWebRuntime,
  resourcesRequest,
} from "../src/modules/resources/resources-http.server";

test("Resources HTTP preserves owner status and code", async () => {
  const error = new ResourceError(409, "conflict", "VERSION_CONFLICT");
  const fail = async () => {
    throw error;
  };
  const runtime: ResourceWebRuntime = {
    scope: async () => ({
      actorUserId: "user",
      repository: { id: "repo", ownerLogin: "owner", name: "repo" },
      archived: false,
      canEdit: true,
      canManage: false,
    }),
    owner: () => ({ list: fail, read: fail, history: fail, execute: fail }),
  };
  const response = await resourcesRequest(
    new Request("https://app.example/api?owner=owner&name=repo"),
    runtime,
    async () => "subject",
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "conflict", code: "VERSION_CONFLICT" });
});
