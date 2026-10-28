import assert from "node:assert/strict";
import test from "node:test";
import { validateCommercialDocument } from "../src/application/commercial-document-validation.js";
import { context, draft, review } from "./commercial-document-review-fixture.js";

test("draft validation preserves source null quantity and does not verify it", () => {
  const report = validateCommercialDocument(draft(), "DRAFT", context);
  assert.equal(report.valid, true);
  assert.equal(report.content?.rows[0]?.rowType, "ITEM");
  assert.equal(report.purpose, "DRAFT");
});
test("verification requires current fingerprint, source coverage and a classified document", () => {
  const content = draft();
  const preview = validateCommercialDocument(content, "DRAFT", context);
  assert.ok(preview.sourceFingerprint);
  assert.equal(validateCommercialDocument(content, "VERIFY", context).valid, false);
  assert.equal(
    validateCommercialDocument(content, "VERIFY", context, review(preview.sourceFingerprint)).valid,
    true,
  );
  assert.equal(
    validateCommercialDocument(content, "VERIFY", context, review("b".repeat(64))).valid,
    false,
  );
  assert.equal(
    validateCommercialDocument(
      { ...content, documentKind: "UNCLASSIFIED" },
      "VERIFY",
      context,
      review(preview.sourceFingerprint),
    ).valid,
    false,
  );
  assert.equal(
    validateCommercialDocument(content, "VERIFY", context, {
      ...review(preview.sourceFingerprint),
      reviewedPageNumbers: [],
    }).valid,
    false,
  );
});
test("invalid shape and ambiguous source facts are diagnostics rather than saved business facts", () => {
  assert.equal(
    validateCommercialDocument({ ...draft(), extra: true }, "DRAFT", context).valid,
    false,
  );
  const content = draft();
  content.header.issueDate = { ...content.header.issueDate, missingReason: "AMBIGUOUS" };
  const preview = validateCommercialDocument(content, "DRAFT", context);
  assert.ok(preview.sourceFingerprint);
  assert.equal(preview.valid, true);
  const result = validateCommercialDocument(
    content,
    "VERIFY",
    context,
    review(preview.sourceFingerprint),
  );
  assert.ok(result.diagnostics.some((d) => d.code === "UNRESOLVED_SOURCE_FIELD"));
});

test("money acknowledgements apply only to current review diagnostics and cannot waive blockers", () => {
  const content = draft();
  const firstRow = content.rows[0];
  assert.ok(firstRow);
  const amount = (value: string) => ({ ...content.header.title, value });
  const summaryId = "33333333-3333-4333-8333-333333333333";
  const withTotals = {
    ...content,
    totals: [
      {
        summaryId,
        scope: { scopeType: "DOCUMENT" as const, sectionId: null, rowId: null },
        currencyCode: "TWD",
        amountBasis: "TAX_EXCLUSIVE" as const,
        itemsAmount: amount("100"),
        nonTaxAdjustmentsAmount: amount("0"),
        taxAmount: amount("5"),
        payableAmount: amount("100"),
        evidenceRefs: firstRow.evidenceRefs,
      },
    ],
  };
  const preview = validateCommercialDocument(withTotals, "DRAFT", context);
  assert.ok(preview.sourceFingerprint);
  const confirmation = review(preview.sourceFingerprint);
  assert.equal(
    validateCommercialDocument(withTotals, "VERIFY", context, confirmation).valid,
    false,
  );
  const acknowledged = {
    ...confirmation,
    acknowledgements: [
      {
        code: `AMOUNT_MISMATCH:${summaryId}`,
        reason: "Original report checked; discrepancy retained",
      },
    ],
  };
  assert.equal(validateCommercialDocument(withTotals, "VERIFY", context, acknowledged).valid, true);
  assert.equal(
    validateCommercialDocument(withTotals, "VERIFY", context, {
      ...acknowledged,
      reviewedPageNumbers: [],
    }).valid,
    false,
  );
  assert.equal(
    validateCommercialDocument(withTotals, "VERIFY", context, {
      ...acknowledged,
      acknowledgements: [{ code: "INCOMPLETE_SOURCE_REVIEW", reason: "Ignore" }],
    }).valid,
    false,
  );
});

test("boundary decoding preserves review fingerprints across input key ordering", () => {
  const content = draft();
  const reordered = Object.fromEntries(Object.entries(content).reverse());
  const original = JSON.stringify(content);
  const first = validateCommercialDocument(content, "DRAFT", context);
  const second = validateCommercialDocument(reordered, "DRAFT", context);
  assert.equal(
    first.money?.contentFingerprint,
    "e5ab0bc4d223e1a96e444d05551c799b6dcd1351a50d4d0ac13681caa8228b05",
  );
  assert.equal(
    first.sourceFingerprint,
    "ae84be999b9d101aece510672c05cd588d7e1bbefcc94e36dcf532824ab9aadc",
  );
  assert.equal(second.sourceFingerprint, first.sourceFingerprint);
  assert.equal(JSON.stringify(content), original);
  const row = second.content?.rows[0];
  assert.equal(row?.rowType, "ITEM");
  if (row?.rowType === "ITEM") assert.equal(row.quantity.value, null);
});
