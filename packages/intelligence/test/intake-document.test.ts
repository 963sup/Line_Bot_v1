import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createDocumentIntake } from "../src/application/use-cases/intake-document.js";
import type { IntakeSchema } from "../src/contracts/output/document-intake.js";
import { IntakeError } from "../src/contracts/output/document-intake.js";

const bytes = new TextEncoder().encode("authorized exact PDF bytes");
const digest = createHash("sha256").update(bytes).digest("hex");
const ids = {
  document: "11111111-1111-4111-8111-111111111111",
  request: "22222222-2222-4222-8222-222222222222",
  file: "33333333-3333-4333-8333-333333333333",
  revision: "44444444-4444-4444-8444-444444444444",
  contractRevision: "55555555-5555-4555-8555-555555555555",
};
const schema = {
  id: "test-document/v1",
  version: 1,
  schema: { type: "object" },
} satisfies IntakeSchema;
const command = {
  action: "save" as const,
  repositoryId: "repo-1",
  documentId: ids.document,
  requestId: ids.request,
  expectedVersion: 0,
  source: { fileId: ids.file, fileRevisionId: ids.revision, fileSha256: digest },
};

function candidate(lines = 54) {
  return {
    header: {
      documentNumber: "PO-1",
      revision: null,
      issueDate: "2026-01-02",
      title: "Purchase",
      currency: "TWD",
    },
    buyer: { name: "Buyer", registrationNumber: null },
    seller: { name: "Seller", registrationNumber: null },
    lines: Array.from({ length: lines }, (_, index) => ({
      sourceRowId: `row-${index + 1}`,
      itemNumber: String(index + 1),
      category: "material",
      materialCode: null,
      description: `Material ${index + 1}`,
      quantity: "1",
      unit: "EA",
      unitPrice: "10.00",
      grossAmount: "10.00",
      discountAmount: "0",
      netAmount: "10.00",
      deliveryDate: null,
      sourcePages: [1],
      uncertain: false,
    })),
    totals: { gross: "540.00", discount: "0", net: "540.00", tax: "27.00", total: "567.00" },
    terms: { text: null, sourcePages: [] },
    fieldEvidence: {},
    corrections: [],
  };
}

type TestReceipt = Readonly<{
  repositoryId: string;
  documentId: string;
  requestId: string;
  revisionId: string;
  version: number;
  source: typeof command.source;
  intentFingerprint: string;
}>;

function submitted(value: unknown): Readonly<{ lineCount: number; intentFingerprint: string }> {
  if (!value || typeof value !== "object") throw new Error("Invalid submitted candidate.");
  const candidate = Reflect.get(value, "candidate");
  const intentFingerprint = Reflect.get(value, "intentFingerprint");
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !Array.isArray(Reflect.get(candidate, "lines")) ||
    typeof intentFingerprint !== "string"
  )
    throw new Error("Invalid submitted candidate.");
  return {
    lineCount: Reflect.get(candidate, "lines").length,
    intentFingerprint,
  };
}

function harness(
  options: {
    candidate?: unknown;
    prior?: TestReceipt;
    hash?: string;
    rejectCandidate?: boolean;
  } = {},
) {
  const calls: {
    reads: number;
    extracts: number;
    submits: number;
    reserves: number;
    completes: number;
    unknowns: number;
    actors: string[];
  } = {
    reads: 0,
    extracts: 0,
    submits: 0,
    reserves: 0,
    completes: 0,
    unknowns: 0,
    actors: [],
  };
  const intake = createDocumentIntake({
    reader: {
      async read(actor, repositoryId, source) {
        calls.reads++;
        calls.actors.push(actor);
        assert.equal(repositoryId, command.repositoryId);
        assert.deepEqual(source, {
          fileId: command.source.fileId,
          fileRevisionId: command.source.fileRevisionId,
        });
        return {
          revision: {
            id: command.source.fileRevisionId,
            fileId: command.source.fileId,
            version: 1,
            parentRevisionId: null,
            repositoryId: command.repositoryId,
            actorUserId: actor,
            at: 0,
            name: "source.pdf",
            sha256: options.hash ?? digest,
            mediaType: "application/pdf",
            byteLength: bytes.byteLength,
          },
          bytes,
        };
      },
    },
    target: {
      async receipt(actor) {
        calls.actors.push(actor);
        return options.prior ?? null;
      },
      async submit(actor, input) {
        calls.submits++;
        calls.actors.push(actor);
        if (options.rejectCandidate) throw new Error("Contract rejected candidate.");
        const submittedCandidate = submitted(input);
        assert.equal(submittedCandidate.lineCount, 54);
        return {
          repositoryId: command.repositoryId,
          documentId: command.documentId,
          requestId: command.requestId,
          revisionId: ids.contractRevision,
          version: 1,
          source: command.source,
          intentFingerprint: submittedCandidate.intentFingerprint,
        };
      },
    },
    attempts: {
      async reserve(actor) {
        calls.reserves++;
        calls.actors.push(actor);
        return { id: "66666666-6666-4666-8666-666666666666", fresh: true };
      },
      async complete(actor) {
        calls.completes++;
        calls.actors.push(actor);
      },
      async unknown(actor) {
        calls.unknowns++;
        calls.actors.push(actor);
      },
    },
    extractor: {
      id: "vercel-ai-gateway",
      version: "document-intake-v1:test",
      async extract(input) {
        calls.extracts++;
        assert.equal(input.schema.id, schema.id);
        return options.candidate ?? candidate();
      },
    },
    schema,
  });
  return { calls, intake };
}

test("authorized intake reads exact bytes once and submits the complete 54-line candidate", async () => {
  const { intake, calls } = harness();
  const result = await intake("verified-actor", command);
  assert.equal(result.version, 1);
  assert.equal(result.source.fileSha256, digest);
  assert.deepEqual(calls, {
    reads: 1,
    extracts: 1,
    submits: 1,
    reserves: 1,
    completes: 1,
    unknowns: 0,
    actors: [
      "verified-actor",
      "verified-actor",
      "verified-actor",
      "verified-actor",
      "verified-actor",
    ],
  });
});

test("matching receipt readback recovers without rereading or rerunning provider; changed intent conflicts", async () => {
  const first = harness();
  const receipt = await first.intake("verified-actor", command);
  const recovered = harness({ prior: receipt });
  assert.deepEqual(await recovered.intake("verified-actor", command), receipt);
  assert.equal(recovered.calls.reads + recovered.calls.extracts + recovered.calls.submits, 0);
  const changed = harness({ prior: receipt });
  await assert.rejects(
    changed.intake("verified-actor", { ...command, expectedVersion: 1 }),
    (error: unknown) => error instanceof IntakeError && error.code === "REPLAY_CONFLICT",
  );
  assert.equal(changed.calls.extracts, 0);
});

test("source mismatch prevents extraction; Contract rejects invalid candidate", async () => {
  const wrongSource = harness({ hash: "0".repeat(64) });
  await assert.rejects(
    wrongSource.intake("verified-actor", command),
    (error: unknown) => error instanceof IntakeError && error.code === "SOURCE_MISMATCH",
  );
  assert.equal(wrongSource.calls.extracts + wrongSource.calls.submits, 0);
  const invalid = harness({ candidate: { lines: [] }, rejectCandidate: true });
  await assert.rejects(invalid.intake("verified-actor", command), /Contract rejected candidate/);
  assert.equal(invalid.calls.submits, 1);
  assert.equal(invalid.calls.unknowns, 1);
});

test("runtime rejects a forged confirm command before any attempt or provider work", async () => {
  const { intake, calls } = harness();
  await assert.rejects(
    Reflect.apply(intake, undefined, ["verified-actor", { ...command, action: "confirm" }]),
    (error: unknown) => error instanceof IntakeError && error.code === "INVALID_INPUT",
  );
  assert.equal(calls.reserves + calls.reads + calls.extracts + calls.submits, 0);
});
