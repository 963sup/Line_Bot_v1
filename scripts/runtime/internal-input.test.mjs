import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import "./cli-test-preload.mjs";

const { InternalInputError, internalActor, readInternalInput } = await import(
  "./internal-input.mjs"
);

test("internal stdin parsing is bounded and never accepts actor claims as identity", async () => {
  assert.deepEqual(
    await readInternalInput(Readable.from(['{"proof":"token","actorUserId":"forged"}'])),
    { proof: "token", actorUserId: "forged" },
  );
  await assert.rejects(readInternalInput(Readable.from(["[]"])), InternalInputError);
  await assert.rejects(readInternalInput(Readable.from(["x".repeat(1048577)])), InternalInputError);
  await assert.rejects(internalActor({}, undefined), { name: "Error", status: 401 });

  let queried = false;
  process.env.CLI_SCENARIO = "auth-invalid";
  await assert.rejects(
    internalActor(
      {
        transaction: async () => {
          queried = true;
        },
      },
      "invalid-proof",
    ),
    { name: "Error", status: 401 },
  );
  delete process.env.CLI_SCENARIO;
  assert.equal(queried, false);
});
