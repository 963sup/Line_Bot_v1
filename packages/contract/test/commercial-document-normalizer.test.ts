import assert from "node:assert/strict";
import test from "node:test";
import { validateCommercialDocumentEvidence } from "../src/application/commercial-document-evidence.js";
import {
  type CommercialDocumentTechnicalResult,
  normalizeCommercialDocument,
} from "../src/application/normalization/commercial-document.js";
import { visitDocumentEvidenceReferences } from "../src/domain/commercial-document-evidence.js";

const id = (n: number) => `11111111-1111-4111-8111-${n.toString().padStart(12, "0")}`;
function result(
  cells: readonly [string | null, string | null, string | null, string | null, number?][],
): CommercialDocumentTechnicalResult {
  return {
    extractionResultId: id(1),
    repositoryId: id(2),
    source: { fileId: id(3), fileRevisionId: id(4), sha256: "a".repeat(64) },
    pageCount: 2,
    observations: cells.map(([rawLabel, rawValue, , , pageNumber], index) => ({
      observationId: id(100 + index),
      pageNumber: pageNumber ?? 1,
      rawLabel,
      rawValue,
    })),
    semanticHints: cells.flatMap(([, , target, rowKey], observationIndex) =>
      target ? [{ observationIndex, target, rowKey }] : [],
    ),
  };
}

test("normalizes synthetic vendor purchase orders, quotations and estimates without inventing values", () => {
  for (const [kind, numberLabel, itemLabel] of [
    ["PURCHASE_ORDER", "PO Number", "Article"],
    ["QUOTATION", "報價編號", "品名規格"],
    ["ESTIMATE", "Estimate reference", "Work description"],
  ]) {
    const input = result([
      ["Form", kind ?? null, "documentKind", null],
      [numberLabel ?? null, "ACME-001", "header.documentNumber", null],
      ["Currency", "TWD", "header.defaultCurrencyCode", null],
      ["Issued", "2026-10-28", "header.issueDate", null],
      [itemLabel ?? null, "Synthetic part", "item.description", "line-1"],
      ["Unit price", "12345678901234567890.123456789012", "item.unitPrice", "line-1"],
      [itemLabel ?? null, "Synthetic part", "item.description", "line-2", 2],
      ["Vendor-specific field", "retain me", "vendor.unknown", null],
    ]);
    const { content, evidenceContext } = normalizeCommercialDocument(input);
    assert.equal(content.documentKind, kind);
    assert.equal(content.header.documentNumber.value, "ACME-001");
    assert.equal(content.header.issueDate.value, "2026-10-28");
    assert.equal(content.rows.length, 2);
    const row = content.rows[0];
    assert.equal(row?.rowType, "ITEM");
    if (row?.rowType !== "ITEM") throw new Error("Expected ITEM");
    assert.equal(row.quantity.value, null);
    assert.equal(row.quantity.missingReason, "NOT_PRESENT");
    assert.deepEqual(row.unitPrice.value, {
      amount: "12345678901234567890.123456789012",
      currencyCode: "TWD",
    });
    assert.notEqual(content.rows[0]?.rowId, content.rows[1]?.rowId);
    assert.ok(
      content.extensionFields.some(
        (e) => e.label === "Vendor-specific field" && e.value === "retain me",
      ),
    );
    const covered = new Set<string>();
    visitDocumentEvidenceReferences(content, (ref) => {
      if (ref.kind === "EXTRACTION") covered.add(ref.observationId);
    });
    assert.equal(covered.size, input.observations.length);
    assert.deepEqual(validateCommercialDocumentEvidence(content, evidenceContext), []);
    assert.equal("reviewState" in content, false);
  }
});

test("malformed dates, formatted or overprecise decimals and duplicate scalar hints remain ambiguous with raw evidence", () => {
  const input = result([
    ["Date", "28/10/2026", "header.issueDate", null],
    ["Title A", "A", "header.title", null],
    ["Title B", "B", "header.title", null],
    ["Quantity", "1,234", "item.quantity", "r"],
    ["Price", "0.1234567890123", "item.unitPrice", "r"],
    ["Description", "part", "item.description", "r"],
    ["Description continued", "part continued", "item.description", "r", 2],
  ]);
  const { content } = normalizeCommercialDocument(input);
  assert.equal(content.header.issueDate.value, null);
  assert.equal(content.header.issueDate.missingReason, "AMBIGUOUS");
  assert.equal(content.header.title.missingReason, "AMBIGUOUS");
  const row = content.rows[0];
  if (row?.rowType !== "ITEM") throw new Error("Expected ITEM");
  for (const field of [row.quantity, row.unitPrice, row.description]) {
    assert.equal(field.value, null);
    assert.equal(field.missingReason, "AMBIGUOUS");
  }
  const retained = [...content.extensionFields, ...row.extensionFields].map((e) => e.value);
  for (const observation of input.observations) assert.ok(retained.includes(observation.rawValue));
});

test("explicit absence, null labels, unknown hints, invalid kinds and missing row keys are retained", () => {
  const { content } = normalizeCommercialDocument(
    result([
      [null, null, null, null],
      ["Currency", "$", "header.defaultCurrencyCode", null],
      ["Type", "vendor-form", "documentKind", null],
      ["Description", "unanchored", "item.description", null],
      ["Q", null, "item.quantity", "r"],
      ["Total", "12.00", "item.lineAmount", "r"],
    ]),
  );
  assert.equal(content.documentKind, "UNCLASSIFIED");
  assert.equal(content.header.defaultCurrencyCode.missingReason, "AMBIGUOUS");
  const row = content.rows[0];
  if (row?.rowType !== "ITEM") throw new Error("Expected ITEM");
  assert.equal(row.quantity.missingReason, "UNREADABLE");
  assert.deepEqual(row.lineAmount.value, { amount: "12", currencyCode: null });
  assert.ok(content.extensionFields.some((e) => e.value === "unanchored"));
});

test("rejects invalid source identities, pages, duplicate observations and hint indexes", () => {
  const input = result([["D", "part", "item.description", "r"]]);
  const observation = input.observations[0];
  if (!observation) throw new Error("Expected observation");
  const bad: CommercialDocumentTechnicalResult[] = [
    { ...input, pageCount: 25 },
    { ...input, repositoryId: "" },
    { ...input, source: { ...input.source, sha256: "bad" } },
    { ...input, observations: [{ ...observation, pageNumber: 3 }] },
    { ...input, observations: [observation, observation] },
    { ...input, semanticHints: [{ observationIndex: 1, target: "item.description", rowKey: "r" }] },
    {
      ...input,
      semanticHints: [{ observationIndex: -1, target: "item.description", rowKey: "r" }],
    },
  ];
  for (const value of bad) assert.throws(() => normalizeCommercialDocument(value));
});

test("rejects over-budget retained fields instead of silently dropping source observations", () => {
  assert.throws(() =>
    normalizeCommercialDocument(
      result(Array.from({ length: 65 }, () => ["Unknown", "value", null, null])),
    ),
  );
  assert.throws(() =>
    normalizeCommercialDocument(result([["Unknown", "x".repeat(2049), null, null]])),
  );
});

test("replay is deterministic and never mutates or aliases technical input", () => {
  const input = result([
    ["D", "part", "item.description", "r"],
    ["Vendor", "custom", null, null],
  ]);
  const snapshot = structuredClone(input);
  const first = normalizeCommercialDocument(input);
  assert.deepEqual(normalizeCommercialDocument(input), first);
  assert.deepEqual(input, snapshot);
  first.evidenceContext.source.sha256 = "b".repeat(64);
  assert.deepEqual(input, snapshot);
});

test("rejects oversized Unicode technical payloads by UTF-8 bytes", () => {
  const input = result(
    Array.from({ length: 50 }, (_, index) => [
      "字".repeat(3000),
      "part",
      "item.description",
      `r-${index}`,
    ]),
  );
  assert.ok(JSON.stringify(input).length < 393_216);
  assert.ok(new TextEncoder().encode(JSON.stringify(input)).byteLength > 393_216);
  assert.throws(() => normalizeCommercialDocument(input));
});

test("classifies explicit source document titles across vendor formats while preserving the raw title", () => {
  for (const [title, kind] of [
    ["Purchase Order", "PURCHASE_ORDER"],
    ["採購單", "PURCHASE_ORDER"],
    ["Quotation", "QUOTATION"],
    ["報價單", "QUOTATION"],
    ["Estimate", "ESTIMATE"],
    ["估價單", "ESTIMATE"],
    ["Contract", "CONTRACT"],
    ["合約", "CONTRACT"],
  ]) {
    const { content } = normalizeCommercialDocument(
      result([["Document", title ?? null, "documentKind", null]]),
    );
    assert.equal(content.documentKind, kind);
    assert.equal(content.extensionFields[0]?.value, title);
  }
});

test("accepts Contract text repository identifiers without relaxing extraction or file UUIDs", () => {
  const input = { ...result([["Title", "Synthetic", "header.title", null]]), repositoryId: "repo" };
  assert.equal(normalizeCommercialDocument(input).content.header.title.value, "Synthetic");
  for (const repositoryId of ["", "r".repeat(129)])
    assert.throws(() => normalizeCommercialDocument({ ...input, repositoryId }));
  assert.throws(() => normalizeCommercialDocument({ ...input, extractionResultId: "result" }));
  assert.throws(() =>
    normalizeCommercialDocument({ ...input, source: { ...input.source, fileId: "file" } }),
  );
  assert.throws(() =>
    normalizeCommercialDocument({
      ...input,
      source: { ...input.source, fileRevisionId: "revision" },
    }),
  );
});
