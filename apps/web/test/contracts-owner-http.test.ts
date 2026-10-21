import assert from "node:assert/strict";
import { test } from "node:test";
import { ContractError } from "@line_bot_v1/contract/domain/error";
import {
  type ContractWebRuntime,
  contractsRequest,
} from "../src/modules/contract/contracts-http.server";

test("Contracts HTTP preserves owner status and code", async () => {
  const error = new ContractError(409, "conflict", "VERSION_CONFLICT");
  const fail = async () => {
    throw error;
  };
  const runtime: ContractWebRuntime = {
    scope: async () => ({
      actorUserId: "user",
      repository: { id: "repo", ownerLogin: "owner", name: "repo" },
      archived: false,
      canEdit: true,
      canManage: false,
    }),
    owner: () => ({ list: fail, read: fail, history: fail, execute: fail }),
  };
  const response = await contractsRequest(
    new Request("https://app.example/api?owner=owner&name=repo"),
    runtime,
    async () => "subject",
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "conflict", code: "VERSION_CONFLICT" });
});
