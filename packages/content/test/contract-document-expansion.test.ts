import assert from "node:assert/strict";
import test from "node:test";
import { createContractDocumentExpansionReader } from "../src/application/use-cases/contract-document-expansion.js";
import type {
  ContractDocumentSource,
  ContractDocumentSourceReader,
} from "../src/contracts/output/plans.js";
import { ContentError } from "../src/domain/error.js";

const source = (overrides: Partial<ContractDocumentSource> = {}): ContractDocumentSource => ({
  id: "revision-1",
  documentId: "document-1",
  state: "CONFIRMED",
  source: { fileId: "file-1", fileRevisionId: "file-revision-1", fileSha256: "a".repeat(64) },
  candidate: {
    header: { title: "Purchase order", documentNumber: "PO-1" },
    lines: [
      {
        sourceRowId: "row-1",
        description: "Install cable",
        quantity: "2",
        unit: "m",
        category: "service",
        uncertain: false,
      },
    ],
  },
  ...overrides,
});

function reader(value: ReturnType<typeof source> | null): ContractDocumentSourceReader {
  return { read: async () => value };
}

test("confirmed Contract documents map into one source-pinned Content expansion", async () => {
  const expansion = await createContractDocumentExpansionReader(reader(source())).readConfirmed(
    "actor",
    "repository-1",
    "document-1",
    "revision-1",
  );
  assert.equal(expansion.title, "Purchase order");
  assert.equal(expansion.sourceFileRevisionId, "file-revision-1");
  assert.deepEqual(expansion.lines, source().candidate.lines);
});

test("missing or unconfirmed Contract documents cannot become Content", async () => {
  for (const value of [null, source({ state: "DRAFT" })])
    await assert.rejects(
      createContractDocumentExpansionReader(reader(value)).readConfirmed(
        "actor",
        "repository-1",
        "document-1",
        "revision-1",
      ),
      (error) => error instanceof ContentError && error.code !== "UNAVAILABLE",
    );
});

test("incomplete material or service lines fail before Content plan mutation", async () => {
  const incomplete = source({
    candidate: {
      header: { title: null, documentNumber: "PO-1" },
      lines: [
        {
          sourceRowId: "row-1",
          description: null,
          quantity: "2",
          unit: "m",
          category: "material",
          uncertain: false,
        },
      ],
    },
  });
  await assert.rejects(
    createContractDocumentExpansionReader(reader(incomplete)).readConfirmed(
      "actor",
      "repository-1",
      "document-1",
      "revision-1",
    ),
    (error) => error instanceof ContentError && error.code === "SOURCE_INVALID",
  );
});
