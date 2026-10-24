import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidatedMainMutationContext,
  remoteMutationRevision,
} from "./remote-authorization.mjs";

test("remote mutations require the validated-main GitHub Actions context", () => {
  assert.throws(
    () => assertValidatedMainMutationContext({}),
    /GitHub Actions current-main reconciliation path/,
  );
  assert.throws(
    () => assertValidatedMainMutationContext({ GITHUB_ACTIONS: "true" }),
    /GitHub Actions current-main reconciliation path/,
  );
  assert.doesNotThrow(() =>
    assertValidatedMainMutationContext({
      GITHUB_ACTIONS: "true",
      SUPABASE_REMOTE_MUTATION_CONTEXT: "validated-main",
    }),
  );
});

test("remote mutation revision requires an exact lowercase Git SHA", () => {
  const releaseSha = "d".repeat(40);
  assert.equal(remoteMutationRevision({ SUPABASE_RELEASE_SHA: releaseSha }), releaseSha);
  assert.throws(() => remoteMutationRevision({}), /exact lowercase Git commit SHA/);
});
