import assert from "node:assert/strict";
import test from "node:test";
import { assessCommercialDocument } from "../src/application/use-cases/commercial-document-review.js";
import { ContractError } from "../src/domain/error.js";
import { context, draft, id, obs, review } from "./commercial-document-review-fixture.js";

const actor = { actorUserId: "authorized", traceId: "request-trace" };
const input = {
  repositoryId: "repository",
  extractionResultId: id,
  purpose: "DRAFT",
  content: draft(),
};
const source = {
  async readQualifiedEvidence(
    user: string,
    scope: { repositoryId: string; extractionResultId: string },
  ) {
    if (
      user !== "authorized" ||
      scope.repositoryId !== "repository" ||
      scope.extractionResultId !== id
    )
      throw new ContractError(403, "Not authorized", "FORBIDDEN");
    return context;
  },
};
test("field input runs through authorized application assessment from draft to verification", async () => {
  const preview = await assessCommercialDocument(actor, input, source);
  assert.equal(preview.valid, true);
  assert.ok(preview.sourceFingerprint);
  const verified = await assessCommercialDocument(
    actor,
    { ...input, purpose: "VERIFY", sourceReview: review(preview.sourceFingerprint) },
    source,
  );
  assert.equal(verified.valid, true);
  assert.equal(verified.purpose, "VERIFY");
  assert.equal("reviewState" in verified, false); // Assessment cannot persist/claim VERIFIED.
});
test("review rechecks authorization and rejects cross-result evidence readers", async () => {
  await assert.rejects(
    assessCommercialDocument({ ...actor, actorUserId: "other" }, input, source),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    assessCommercialDocument(actor, { ...input, repositoryId: "other" }, source),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    assessCommercialDocument(actor, input, {
      async readQualifiedEvidence() {
        return { ...context, extractionResultId: obs };
      },
    }),
    { code: "SOURCE_INVALID" },
  );
});
test("public assessment does not accept actor, model, or unknown command fields", async () => {
  for (const extra of [{ actorUserId: "other" }, { model: "other" }, { reviewState: "VERIFIED" }])
    await assert.rejects(assessCommercialDocument(actor, { ...input, ...extra }, source), {
      code: "INVALID_INPUT",
    });
});
