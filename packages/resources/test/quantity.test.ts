import assert from "node:assert/strict";
import test from "node:test";
import { ObjectError } from "../src/domain/error.js";
import { normalizeQuantity, quantityUnits, quantityValue } from "../src/domain/quantity.js";

function invalidInput(error: unknown, message: string) {
  return (
    error instanceof ObjectError && error.code === "INVALID_INPUT" && error.message === message
  );
}

test("quantity conversion is exact and canonical without rounding", () => {
  assert.equal(quantityUnits("999999999999999.999"), 999999999999999999n);
  assert.equal(quantityUnits("0.1") + quantityUnits("0.2"), quantityUnits("0.3"));
  assert.equal(quantityValue(1200n), "1.2");
  assert.equal(normalizeQuantity("1.230", "m"), "1.23");
  assert.equal(normalizeQuantity("12", "pcs"), "12");
});

test("quantity normalization preserves decimal and unit constraints", () => {
  const decimalMessage = "數量須為非負十進位字串，整數最多 15 位、小數最多 3 位。";
  for (const value of ["-1", "1e3", "1.0001", "01", "", "1000000000000000"])
    assert.throws(
      () => normalizeQuantity(value, "m"),
      (error) => invalidInput(error, decimalMessage),
    );
  for (const value of ["0.1", "1.0"])
    assert.throws(
      () => normalizeQuantity(value, "pcs"),
      (error) => invalidInput(error, "pcs 數量必須是整數。"),
    );
});
