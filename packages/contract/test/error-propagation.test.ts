import assert from "node:assert/strict";
import { test } from "node:test";
import { ContractError, contractErrorFromUnknown } from "../src/domain/error.js";

test("unknown infrastructure errors retain their original identity and database code", () => {
  const original = Object.assign(new Error("relation does not exist"), { code: "42P01" });
  assert.throws(
    () => contractErrorFromUnknown(original),
    (error) => error === original,
  );
});

test("explicit Contract failures retain their status and identity", () => {
  const original = new ContractError(409, "Document version conflict.", "VERSION_CONFLICT");
  assert.equal(contractErrorFromUnknown(original), original);
});
