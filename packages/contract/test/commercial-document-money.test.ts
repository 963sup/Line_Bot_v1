import assert from "node:assert/strict";
import test from "node:test";
import { reconcileDocumentAmounts } from "../src/application/commercial-document-money.js";
import { commercialDocumentContentSchema } from "../src/contracts/input/commercial-document.js";

const id = "11111111-1111-4111-8111-111111111111";
const refs = [{ kind: "HUMAN", evidenceId: id }];
const missing = {
  value: null,
  missingReason: "NOT_PRESENT",
  evidenceRefs: [],
  origin: "EXTRACTION",
  correctionReason: null,
};
function fact(value: string | null) {
  return value === null ? missing : { ...missing, value, missingReason: null, evidenceRefs: refs };
}
function document(
  amountBasis = "TAX_EXCLUSIVE",
  values: (string | null)[] = ["100", "-10", "4.5", "94.5"],
  currencyCode: string | null = "TWD",
) {
  return commercialDocumentContentSchema.parse({
    documentKind: "QUOTATION",
    header: {
      documentNumber: missing,
      documentRevisionLabel: missing,
      title: fact("Synthetic"),
      issueDate: missing,
      validUntilDate: missing,
      defaultCurrencyCode: missing,
    },
    parties: [],
    sections: [],
    rows: [],
    selectionGroups: [],
    totals: [
      {
        summaryId: id,
        scope: { scopeType: "DOCUMENT", sectionId: null, rowId: null },
        currencyCode,
        amountBasis,
        itemsAmount: fact(values[0] ?? null),
        nonTaxAdjustmentsAmount: fact(values[1] ?? null),
        taxAmount: fact(values[2] ?? null),
        payableAmount: fact(values[3] ?? null),
        evidenceRefs: refs,
      },
    ],
    terms: [],
    extensionFields: [],
  });
}
test("exclusive tax uses exact signed adjustments without double-negating discounts", () => {
  const input = document();
  const original = JSON.stringify(input);
  const report = reconcileDocumentAmounts(input, 1);
  assert.equal(report.status, "PASS");
  assert.equal(report.checks[0]?.computedAmount, "94.5");
  assert.equal(report.rulesetVersion, 1);
  assert.match(report.contentFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(input), original);
});
test("inclusive tax does not add included tax twice and need not invent missing tax", () => {
  const report = reconcileDocumentAmounts(document("TAX_INCLUSIVE", ["100", "-10", null, "90"]), 1);
  assert.equal(report.status, "PASS");
  assert.equal(report.checks[0]?.computedAmount, "90");
});
test("source discrepancies are reported without rewriting reported amounts", () => {
  const input = document("TAX_EXCLUSIVE", ["100", "-10", "4.5", "90"]);
  const report = reconcileDocumentAmounts(input, 1);
  assert.equal(report.status, "MISMATCH");
  assert.equal(report.checks[0]?.reportedAmount, "90");
  assert.equal(input.totals[0]?.payableAmount.value, "90");
});
test("missing inputs, unknown currencies and unspecified tax bases are not a passing calculation", () => {
  for (const input of [
    document("MIXED"),
    document("UNSPECIFIED"),
    document("TAX_EXCLUSIVE", ["100", null, "5", "105"]),
    document("TAX_EXCLUSIVE", undefined, null),
    { ...document(), totals: [] },
  ]) {
    assert.equal(reconcileDocumentAmounts(input, 1).status, "NOT_COMPUTABLE");
  }
});
test("large decimals retain precision and equivalent source representations have the same fingerprint", () => {
  const first = document("TAX_EXCLUSIVE", [
    "12345678901234567890123456.123456789012",
    "0",
    "0",
    "12345678901234567890123456.123456789012",
  ]);
  assert.equal(reconcileDocumentAmounts(first, 1).status, "PASS");
  const a = document("TAX_INCLUSIVE", ["100.00", "-10.0", null, "90.000"]);
  const b = document("TAX_INCLUSIVE", ["100", "-10", null, "90"]);
  assert.equal(
    reconcileDocumentAmounts(a, 1).contentFingerprint,
    reconcileDocumentAmounts(b, 1).contentFingerprint,
  );
  assert.throws(() => reconcileDocumentAmounts(b, 2), /ruleset/i);
});

test("each summary keeps its own currency and scope instead of combining reported totals", () => {
  const input = document();
  const other = document("TAX_INCLUSIVE", ["200", "-20", null, "180"], "USD");
  const report = reconcileDocumentAmounts(
    {
      ...input,
      totals: [
        ...input.totals,
        ...other.totals.map((summary) => ({
          ...summary,
          summaryId: "22222222-2222-4222-8222-222222222222",
        })),
      ],
    },
    1,
  );
  assert.equal(report.status, "PASS");
  assert.deepEqual(
    report.checks.map((check) => check.computedAmount),
    ["94.5", "180"],
  );
});
