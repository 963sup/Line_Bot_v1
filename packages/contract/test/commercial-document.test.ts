import assert from "node:assert/strict";
import test from "node:test";
import { commercialDocumentContentSchema } from "../src/contracts/input/commercial-document.js";

const id = "11111111-1111-4111-8111-111111111111";
const missing = {
  value: null,
  missingReason: "NOT_PRESENT",
  evidenceRefs: [],
  origin: "EXTRACTION",
  correctionReason: null,
};
const fact = {
  ...missing,
  value: "Synthetic",
  missingReason: null,
  evidenceRefs: [{ kind: "HUMAN", evidenceId: id }],
};
function document() {
  return {
    documentKind: "ESTIMATE",
    header: {
      documentNumber: missing,
      documentRevisionLabel: missing,
      title: fact,
      issueDate: missing,
      validUntilDate: missing,
      defaultCurrencyCode: missing,
    },
    parties: [],
    sections: [],
    rows: [],
    selectionGroups: [],
    totals: [],
    terms: [],
    extensionFields: [],
  };
}
test("commercial drafts preserve missing values for every document kind and reject legacy aliases", () => {
  for (const documentKind of [
    "PURCHASE_ORDER",
    "QUOTATION",
    "ESTIMATE",
    "CONTRACT",
    "UNCLASSIFIED",
  ])
    assert.equal(
      commercialDocumentContentSchema.safeParse({ ...document(), documentKind }).success,
      true,
    );
  assert.equal(
    commercialDocumentContentSchema.safeParse({ ...document(), buyer: {} }).success,
    false,
  );
});
test("same vendor label can occur twice with distinct field identity", () => {
  const extension = {
    fieldId: id,
    label: "Vendor field",
    valueType: "TEXT",
    value: "A",
    missingReason: null,
    unitLabel: null,
    evidenceRefs: fact.evidenceRefs,
  };
  assert.equal(
    commercialDocumentContentSchema.safeParse({
      ...document(),
      extensionFields: [
        extension,
        { ...extension, fieldId: "22222222-2222-4222-8222-222222222222" },
      ],
    }).success,
    true,
  );
  assert.equal(
    commercialDocumentContentSchema.safeParse({
      ...document(),
      extensionFields: [extension, extension],
    }).success,
    false,
  );
  assert.equal(
    commercialDocumentContentSchema.safeParse({
      ...document(),
      extensionFields: [{ ...extension, valueType: "DECIMAL", value: "bad" }],
    }).success,
    false,
  );
});
test("section graphs reject missing parents and cycles", () => {
  const section = {
    sectionId: id,
    parentSectionId: id,
    position: 0,
    title: fact,
    evidenceRefs: fact.evidenceRefs,
  };
  assert.equal(
    commercialDocumentContentSchema.safeParse({ ...document(), sections: [section] }).success,
    false,
  );
  assert.equal(
    commercialDocumentContentSchema.safeParse({
      ...document(),
      sections: [{ ...section, parentSectionId: null }],
    }).success,
    true,
  );
});
test("row identities, group membership and pricing references cannot silently lose source rows", () => {
  const row = {
    rowType: "NOTE",
    rowId: id,
    sectionId: null,
    position: 0,
    evidenceRefs: fact.evidenceRefs,
    extensionFields: [],
    text: fact,
  };
  assert.equal(
    commercialDocumentContentSchema.safeParse({ ...document(), rows: [row] }).success,
    true,
  );
  assert.equal(
    commercialDocumentContentSchema.safeParse({ ...document(), rows: [row, row] }).success,
    false,
  );
  assert.equal(
    commercialDocumentContentSchema.safeParse({ ...document(), rows: [{ ...row, sectionId: id }] })
      .success,
    false,
  );
  assert.equal(
    commercialDocumentContentSchema.safeParse({
      ...document(),
      rows: [row],
      selectionGroups: [
        {
          selectionGroupId: id,
          label: "Choice",
          itemRowIds: [id],
          selectionMode: "ONE_OF",
          evidenceRefs: fact.evidenceRefs,
        },
      ],
    }).success,
    false,
  );
});

test("document payload budget rejects oversized facts without truncating source text", () => {
  const terms = Array.from({ length: 64 }, (_, i) => ({
    termId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    termKind: "OTHER",
    text: { ...fact, value: "字".repeat(8000) },
  }));
  assert.equal(commercialDocumentContentSchema.safeParse({ ...document(), terms }).success, false);
});

test("long section chains and a cycle reached through a descendant are handled without recursion", () => {
  const ids = Array.from(
    { length: 500 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  const sections = ids.map((sectionId, i) => ({
    sectionId,
    parentSectionId: ids[i + 1] ?? null,
    position: i,
    title: missing,
    evidenceRefs: fact.evidenceRefs,
  }));
  assert.equal(
    commercialDocumentContentSchema.safeParse({ ...document(), sections }).success,
    true,
  );
  const cyclic = sections.map((section, i) =>
    i === 499 ? { ...section, parentSectionId: ids[250] } : section,
  );
  assert.equal(
    commercialDocumentContentSchema.safeParse({ ...document(), sections: cyclic }).success,
    false,
  );
});
