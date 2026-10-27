import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  purchaseOrderExtractionSchema,
  purchaseOrderExtractionSchemaId,
  purchaseOrderExtractionSchemaVersion,
} from "../src/contracts/input/document-intake.js";
import {
  addExactDecimals,
  createDocumentRevision,
  type PurchaseOrderCandidate,
} from "../src/domain/document-intake.js";
import { ContractError } from "../src/domain/error.js";

function candidate(lineCount: number): PurchaseOrderCandidate {
  return {
    header: {
      documentNumber: "PO-TEST",
      revision: "A",
      issueDate: "2026-01-01",
      title: "Synthetic purchase order",
      currency: "TWD",
    },
    buyer: { name: "Synthetic buyer", registrationNumber: null },
    seller: { name: "Synthetic seller", registrationNumber: null },
    lines: Array.from({ length: lineCount }, (_, index) => ({
      sourceRowId: `row-${index + 1}`,
      itemNumber: String(index + 1),
      category: "material",
      materialCode: `M-${index + 1}`,
      description: `Synthetic line ${index + 1}`,
      quantity: "1",
      unit: "ea",
      unitPrice: "10",
      grossAmount: "10",
      discountAmount: "0",
      netAmount: "10",
      deliveryDate: null,
      sourcePages: [1 + Math.floor(index / 10)],
      uncertain: false,
    })),
    totals: {
      gross: String(lineCount * 10),
      discount: "0",
      net: String(lineCount * 10),
      tax: "0",
      total: String(lineCount * 10),
    },
    terms: { text: "Synthetic terms", sourcePages: [1] },
    fieldEvidence: {},
    corrections: [],
  };
}

function draft(facts = candidate(54)) {
  return createDocumentRevision(null, {
    action: "save",
    expectedVersion: 0,
    candidate: facts,
    source: { fileId: randomUUID(), fileRevisionId: randomUUID(), fileSha256: "a".repeat(64) },
    id: randomUUID(),
    documentId: randomUUID(),
    repositoryId: "repo",
    actorUserId: "actor",
    at: 1,
  });
}

function sourceReviewAttestation(facts: PurchaseOrderCandidate) {
  return {
    verifiedLineCount: facts.lines.length,
    reviewedSourcePages: [
      ...new Set([...facts.lines.flatMap((line) => line.sourcePages), ...facts.terms.sourcePages]),
    ],
    reviewedSourceRowIds: facts.lines.map((line) => line.sourceRowId),
    confirmedFromOriginal: true as const,
  };
}

function confirm(
  current: ReturnType<typeof draft>,
  acknowledgement?: { reason: string },
  candidateFacts = current.candidate,
) {
  return createDocumentRevision(current, {
    action: "confirm",
    expectedVersion: current.version,
    candidate: candidateFacts,
    source: current.source,
    sourceReviewAttestation: sourceReviewAttestation(candidateFacts),
    ...(acknowledgement ? { acknowledgement } : {}),
    id: randomUUID(),
    documentId: current.documentId,
    repositoryId: "repo",
    actorUserId: "actor",
    at: 2,
  });
}

test("accepts a complete 54-line synthetic purchase order as one confirmed revision", () => {
  const revision = confirm(draft());
  assert.equal(revision.state, "CONFIRMED");
  assert.equal(revision.candidate.lines.length, 54);
  assert.equal(new Set(revision.candidate.lines.map((line) => line.sourceRowId)).size, 54);
  assert.deepEqual(revision.diagnostics, []);
});

test("derives the source line count from the AI candidate instead of persisting caller input", () => {
  const revision = draft();
  assert.equal("expectedLineCount" in revision, false);
  assert.equal(revision.candidate.lines.length, 54);
});

test("confirmation relies on source review coverage instead of a caller-supplied line count", () => {
  const saved = draft(candidate(53));
  assert.deepEqual(saved.diagnostics, []);
  assert.equal(confirm(saved).state, "CONFIRMED");
});

test("exact decimal aggregation preserves monetary precision without floating point", () => {
  assert.equal(addExactDecimals(["99613576", "-18113576"]), "81500000");
  assert.equal(addExactDecimals(["0.1", "0.2", "-0.05"]), "0.25");
  assert.equal(addExactDecimals(["10.00", "-9"]), "1");
});

test("confirmation rejects a line gross that does not equal quantity times unit price", () => {
  const facts = candidate(1);
  const invalid: PurchaseOrderCandidate = {
    ...facts,
    lines: facts.lines.map((line) => ({ ...line, grossAmount: "20" })),
  };
  const saved = draft(invalid);
  assert.throws(
    () => confirm(saved),
    (error: unknown) => error instanceof ContractError && error.code === "INVALID_INPUT",
  );
});

test("purchase-order schema publishes a nullable string enum and stable version", () => {
  assert.equal(purchaseOrderExtractionSchemaId, "purchase-order/v1");
  assert.equal(purchaseOrderExtractionSchemaVersion, 1);
  const schema = purchaseOrderExtractionSchema;
  assert.equal(schema.$id, purchaseOrderExtractionSchemaId);
  assert.equal(schema.$defs.line.properties.category.anyOf.length, 2);
});

test("purchase-order response schema has no dynamic evidence object keys", () => {
  const evidence = purchaseOrderExtractionSchema.properties.fieldEvidence;
  assert.deepEqual(evidence, {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {},
  });
});

test("confirmation preserves reported tax and requires an auditable reason for total discrepancies", () => {
  const reported = candidate(54);
  const withPrintedTax = {
    ...reported,
    totals: { ...reported.totals, tax: "1", total: "540" },
  };
  assert.throws(
    () => confirm(draft(withPrintedTax)),
    (error: unknown) => error instanceof ContractError && error.code === "INVALID_INPUT",
  );
  const saved = draft(withPrintedTax);
  const confirmed = confirm(saved, {
    reason: "Preserve the source printed tax and total; discrepancy reviewed.",
  });
  assert.equal(confirmed.candidate.totals.tax, "1");
  assert.equal(
    confirmed.acknowledgementReason,
    "Preserve the source printed tax and total; discrepancy reviewed.",
  );
  assert.ok(confirmed.diagnostics.includes("NET_TAX_TOTAL_MISMATCH"));
});

test("confirmed document facts are immutable and stale versions conflict", () => {
  const confirmed = confirm(draft());
  assert.throws(
    () =>
      createDocumentRevision(confirmed, {
        action: "save",
        expectedVersion: confirmed.version,
        candidate: candidate(54),
        source: confirmed.source,
        id: randomUUID(),
        documentId: confirmed.documentId,
        repositoryId: "repo",
        actorUserId: "actor",
        at: 2,
      }),
    (error: unknown) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
  assert.throws(
    () =>
      createDocumentRevision(null, {
        action: "save",
        expectedVersion: 1,
        candidate: candidate(54),
        source: confirmed.source,
        id: randomUUID(),
        documentId: randomUUID(),
        repositoryId: "repo",
        actorUserId: "actor",
        at: 2,
      }),
    (error: unknown) => error instanceof ContractError && error.code === "VERSION_CONFLICT",
  );
});

test("confirmation requires a saved review draft", () => {
  const facts = candidate(54);
  assert.throws(
    () =>
      createDocumentRevision(null, {
        action: "confirm",
        expectedVersion: 0,
        candidate: facts,
        source: {
          fileId: randomUUID(),
          fileRevisionId: randomUUID(),
          fileSha256: "a".repeat(64),
        },
        id: randomUUID(),
        documentId: randomUUID(),
        repositoryId: "repo",
        actorUserId: "actor",
        at: 1,
      }),
    (error: unknown) => error instanceof ContractError && error.code === "LIFECYCLE_CONFLICT",
  );
});
