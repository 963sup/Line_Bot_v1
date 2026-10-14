import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { internalActor, readInternalInput } from "./internal-input.mjs";

test("internal stdin parsing is bounded and never accepts actor claims as identity", async () => {
  assert.deepEqual(
    await readInternalInput(Readable.from(['{"proof":"token","actorUserId":"forged"}'])),
    { proof: "token", actorUserId: "forged" },
  );
  await assert.rejects(readInternalInput(Readable.from(["[]"])));
  await assert.rejects(readInternalInput(Readable.from(["x".repeat(1048577)])));
  let queried = false;
  const db = {
    transaction: async () => {
      queried = true;
      throw new Error("must not query");
    },
  };
  await assert.rejects(
    internalActor(db, "invalid", async () => new Response(null, { status: 401 })),
  );
  assert.equal(queried, false);
});
