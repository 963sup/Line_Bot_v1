import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { createPostgresFileDependencies } from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileRevision } from "@line_bot_v1/file/domain/file";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createPostgresContractDocuments } from "../src/composition/bootstrap/documents.js";
import type { PurchaseOrderCandidate } from "../src/domain/document-intake.js";
import { ContractError } from "../src/domain/error.js";

function candidate(): PurchaseOrderCandidate {
  return {
    header: {
      documentNumber: "PO-TEST",
      revision: "A",
      issueDate: "2026-01-01",
      title: "Synthetic order",
      currency: "TWD",
    },
    buyer: { name: "Synthetic buyer", registrationNumber: null },
    seller: { name: "Synthetic seller", registrationNumber: null },
    lines: [
      {
        sourceRowId: "row-1",
        itemNumber: "1",
        category: "material",
        materialCode: "SYN-1",
        description: "Synthetic line",
        quantity: "1.00",
        unit: "ea",
        unitPrice: "10.00",
        grossAmount: "10.00",
        discountAmount: "0.00",
        netAmount: "10.00",
        deliveryDate: null,
        sourcePages: [1],
        uncertain: false,
      },
    ],
    totals: { gross: "10", discount: "0", net: "10", tax: "0", total: "10" },
    terms: { text: "Synthetic terms", sourcePages: [1] },
    fieldEvidence: {},
    corrections: [],
  };
}

async function seed(db: Database) {
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt")
       VALUES('owner','active',1,1),('outsider','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
}

function objectStore() {
  const bytesByRevision = new Map<string, Uint8Array>();
  return {
    async putVerified(revision: FileRevision, bytes: Uint8Array) {
      bytesByRevision.set(revision.id, Uint8Array.from(bytes));
    },
    async readVerified(revision: FileRevision) {
      const bytes = bytesByRevision.get(revision.id);
      if (!bytes) throw new Error("Test File bytes missing");
      return Uint8Array.from(bytes);
    },
  };
}

const forbidden = (error: unknown) => error instanceof ContractError && error.code === "FORBIDDEN";
const reused = (error: unknown) =>
  error instanceof ContractError && error.code === "REQUEST_ID_REUSED";
const sourceInvalid = (error: unknown) =>
  error instanceof ContractError && error.code === "SOURCE_INVALID";
const unavailable = (error: unknown) =>
  error instanceof ContractError && error.code === "UNAVAILABLE";

test("PostgreSQL document intake authorizes, pins source, replays exactly and rolls back failed receipts", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Contract','private')",
  );
  const files = createFiles({
    ...createPostgresFileDependencies(db, objectStore()),
    now: () => 10,
  });
  const fileCommand = {
    repositoryId: "repo",
    fileId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    name: "synthetic.pdf",
    mediaType: "application/pdf",
  };
  const upload = await files.upload(
    "owner",
    fileCommand,
    new TextEncoder().encode("synthetic source bytes"),
  );
  const source = {
    fileId: fileCommand.fileId,
    fileRevisionId: upload.file.revisionId,
    fileSha256: upload.file.sha256,
  };
  const intake = createPostgresContractDocuments(db);
  const documentId = randomUUID();
  const requestId = randomUUID();
  const intentFingerprint = createHash("sha256").update("stable-intent").digest("hex");
  const savedCommand = {
    action: "save" as const,
    repositoryId: "repo",
    documentId,
    requestId,
    intentFingerprint,
    expectedVersion: 0,
    source,
    expectedLineCount: 1,
    candidate: candidate(),
  };
  const saved = await intake.submit("owner", savedCommand);
  assert.equal(saved.version, 1);
  const reviewed = await intake.read("owner", { repositoryId: "repo", documentId });
  assert.equal(reviewed.version, 1);
  assert.equal(reviewed.schemaVersion, 1);
  assert.equal(reviewed.candidate.lines.length, 1);
  assert.deepEqual(reviewed.diagnostics, []);
  assert.equal(
    (await intake.read("owner", { repositoryId: "repo", documentId, revisionId: saved.revisionId }))
      .id,
    saved.revisionId,
  );
  assert.deepEqual(await intake.submit("owner", savedCommand), saved);
  assert.deepEqual(
    await intake.receipt("owner", {
      repositoryId: "repo",
      documentId: documentId.toUpperCase(),
      requestId: requestId.toUpperCase(),
    }),
    saved,
  );
  assert.deepEqual(
    await intake.submit("owner", {
      ...savedCommand,
      documentId: documentId.toUpperCase(),
      requestId: requestId.toUpperCase(),
      source: {
        fileId: source.fileId.toUpperCase(),
        fileRevisionId: source.fileRevisionId.toUpperCase(),
        fileSha256: source.fileSha256,
      },
    }),
    saved,
  );
  await assert.rejects(
    intake.submit("owner", {
      ...savedCommand,
      candidate: {
        ...savedCommand.candidate,
        header: { ...savedCommand.candidate.header, title: "Changed" },
      },
    }),
    reused,
  );
  await assert.rejects(
    intake.submit("owner", {
      ...savedCommand,
      intentFingerprint: "b".repeat(64),
    }),
    reused,
  );
  await assert.rejects(intake.submit("outsider", savedCommand), forbidden);
  await assert.rejects(
    intake.receipt("outsider", { repositoryId: "repo", documentId, requestId }),
    forbidden,
  );
  await assert.rejects(intake.read("outsider", { repositoryId: "repo", documentId }), forbidden);
  await assert.rejects(
    intake.submit("owner", {
      ...savedCommand,
      requestId: randomUUID(),
      documentId: randomUUID(),
      source: { ...source, fileSha256: "0".repeat(64) },
    }),
    sourceInvalid,
  );

  const reportedTax = {
    ...savedCommand.candidate,
    totals: { ...savedCommand.candidate.totals, tax: "1", total: "10" },
  };
  const updatedDraft = await intake.submit("owner", {
    ...savedCommand,
    requestId: randomUUID(),
    expectedVersion: 1,
    candidate: reportedTax,
  });
  assert.equal(updatedDraft.version, 2);
  const confirmRequestId = randomUUID();
  await assert.rejects(
    intake.submit("owner", {
      action: "confirm",
      repositoryId: "repo",
      documentId,
      requestId: confirmRequestId,
      intentFingerprint,
      expectedVersion: 2,
      source,
      expectedLineCount: 1,
      candidate: savedCommand.candidate,
    }),
    (error) => error instanceof ContractError && error.code === "SOURCE_INVALID",
  );
  await assert.rejects(
    intake.submit("owner", {
      action: "confirm",
      repositoryId: "repo",
      documentId,
      requestId: confirmRequestId,
      intentFingerprint,
      expectedVersion: 2,
      source: { ...source, fileRevisionId: randomUUID() },
      expectedLineCount: 1,
      candidate: reportedTax,
    }),
    sourceInvalid,
  );
  await assert.rejects(
    intake.submit("owner", {
      action: "confirm",
      repositoryId: "repo",
      documentId,
      requestId: confirmRequestId,
      intentFingerprint,
      expectedVersion: 2,
      source,
      expectedLineCount: 2,
      candidate: reportedTax,
    }),
    sourceInvalid,
  );
  await assert.rejects(
    intake.submit("owner", {
      action: "confirm",
      repositoryId: "repo",
      documentId,
      requestId: confirmRequestId,
      intentFingerprint,
      expectedVersion: 2,
      source,
      expectedLineCount: 1,
      candidate: reportedTax,
    }),
    (error) => error instanceof ContractError && error.code === "INVALID_INPUT",
  );
  const confirmId = randomUUID();
  const confirmed = await intake.submit("owner", {
    action: "confirm",
    repositoryId: "repo",
    documentId,
    requestId: confirmId,
    intentFingerprint,
    expectedVersion: 2,
    source,
    expectedLineCount: 1,
    candidate: reportedTax,
    acknowledgement: {
      reason: "Preserve printed source amounts; the total discrepancy was reviewed.",
    },
  });
  assert.equal(confirmed.version, 3);
  const persisted = await db.transaction((sql) =>
    sql.query(
      "SELECT acknowledgement_reason,state,schema_version FROM contract_document_revisions WHERE id=$1",
      [confirmed.revisionId],
    ),
  );
  assert.equal(persisted.rows[0]?.state, "CONFIRMED");
  assert.equal(persisted.rows[0]?.schema_version, 1);
  assert.equal(
    persisted.rows[0]?.acknowledgement_reason,
    "Preserve printed source amounts; the total discrepancy was reviewed.",
  );

  const failedDocument = randomUUID();
  const failedRequest = randomUUID();
  await pg.query(`CREATE FUNCTION app_private.reject_test_document_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'forced document receipt failure'; END $$;
  `);
  await pg.query(`CREATE TRIGGER reject_test_document_receipt BEFORE INSERT ON app_private.contract_document_commands
    FOR EACH ROW EXECUTE FUNCTION app_private.reject_test_document_receipt()`);
  await assert.rejects(
    intake.submit("owner", {
      ...savedCommand,
      documentId: failedDocument,
      requestId: failedRequest,
    }),
    unavailable,
  );
  const rolledBack = await db.transaction((sql) =>
    sql.query("SELECT id FROM contract_documents WHERE id=$1", [failedDocument]),
  );
  assert.equal(rolledBack.rows.length, 0);
});

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;
test("independent PostgreSQL sessions serialize document intake at the expected version", {
  skip: !databaseUrl && !process.env.CI,
}, async (t) => {
  assert.ok(databaseUrl, "CI requires its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(databaseUrl);
  t.after(close);
  await seed(db);
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Contract','private')",
  );
  const files = createFiles({
    ...createPostgresFileDependencies(db, objectStore()),
    now: () => 20,
  });
  const fileCommand = {
    repositoryId: "repo",
    fileId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    name: "synthetic.pdf",
    mediaType: "application/pdf",
  };
  const upload = await files.upload("owner", fileCommand, new TextEncoder().encode("source"));
  const source = {
    fileId: fileCommand.fileId,
    fileRevisionId: upload.file.revisionId,
    fileSha256: upload.file.sha256,
  };
  const documents = createPostgresContractDocuments(db);
  const documentId = randomUUID();
  const candidateBase = candidate();
  const initial = {
    action: "save" as const,
    repositoryId: "repo",
    documentId,
    requestId: randomUUID(),
    intentFingerprint: createHash("sha256").update("intent").digest("hex"),
    expectedVersion: 0,
    source,
    expectedLineCount: 1,
    candidate: candidateBase,
  };
  await documents.submit("owner", initial);
  const edits = ["First concurrent save", "Second concurrent save"].map((title) =>
    documents.submit("owner", {
      ...initial,
      requestId: randomUUID(),
      expectedVersion: 1,
      candidate: {
        ...candidateBase,
        header: { ...candidateBase.header, title },
      },
    }),
  );
  const results = await Promise.allSettled(edits);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const conflict = results.find((result) => result.status === "rejected");
  assert.ok(conflict && conflict.status === "rejected");
  assert.ok(conflict.reason instanceof ContractError);
  assert.equal(conflict.reason.code, "VERSION_CONFLICT");
});
