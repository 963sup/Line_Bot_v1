import assert from "node:assert/strict";
import test from "node:test";
import {
  commercialFieldValueSchema,
  dateOnlySchema,
  decimalStringSchema,
  moneySchema,
} from "../src/contracts/input/commercial-document-values.js";

const evidence = [{ kind: "HUMAN", evidenceId: "11111111-1111-4111-8111-111111111111" }];
test("commercial decimal values preserve exact precision and canonicalize negative zero", () => {
  assert.equal(
    decimalStringSchema.parse("12345678901234567890123456.123456789012"),
    "12345678901234567890123456.123456789012",
  );
  assert.equal(decimalStringSchema.parse("-0.000"), "0");
  assert.equal(decimalStringSchema.parse("12.3400"), "12.34");
  for (const bad of ["1e3", "01", "1,000", "0.1234567890123", "9".repeat(39), 1, ""])
    assert.equal(decimalStringSchema.safeParse(bad).success, false);
});
test("source dates reject impossible and ambiguous calendar values", () => {
  assert.equal(dateOnlySchema.parse("2024-02-29"), "2024-02-29");
  for (const bad of ["2025-02-29", "2026-04-31", "01/02/2026"])
    assert.equal(dateOnlySchema.safeParse(bad).success, false);
});
test("facts distinguish absent values from zero and require evidence and correction reasons", () => {
  const schema = commercialFieldValueSchema(decimalStringSchema);
  const fact = {
    value: "0",
    missingReason: null,
    evidenceRefs: evidence,
    origin: "EXTRACTION",
    correctionReason: null,
  };
  assert.equal(schema.safeParse(fact).success, true);
  assert.equal(
    schema.safeParse({ ...fact, value: null, missingReason: "NOT_PRESENT", evidenceRefs: [] })
      .success,
    true,
  );
  for (const bad of [
    { ...fact, missingReason: "NOT_PRESENT" },
    { ...fact, value: null },
    { ...fact, evidenceRefs: [] },
    { ...fact, origin: "HUMAN_CORRECTION" },
    { ...fact, extra: true },
  ])
    assert.equal(schema.safeParse(bad).success, false);
  assert.equal(
    schema.safeParse({
      ...fact,
      origin: "HUMAN_CORRECTION",
      correctionReason: "Read against original",
    }).success,
    true,
  );
});
test("money keeps unknown currency distinct and rejects fabricated currency codes", () => {
  assert.deepEqual(moneySchema.parse({ amount: "-12.50", currencyCode: null }), {
    amount: "-12.5",
    currencyCode: null,
  });
  assert.equal(moneySchema.safeParse({ amount: "1", currencyCode: "TWD" }).success, true);
  assert.equal(moneySchema.safeParse({ amount: "1", currencyCode: "ZZZ" }).success, false);
});
