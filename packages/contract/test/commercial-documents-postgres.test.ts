import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import { createPostgresFileDependencies, createPostgresFileRevisionQualifier } from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileRevision } from "@line_bot_v1/file/domain/file";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createPostgresCommercialDocuments } from "../src/composition/bootstrap/commercial-documents.js";
import { context, draft, id } from "./commercial-document-review-fixture.js";

test("commercial draft transactions persist fields, replay receipts and roll back failed receipts", async (t) => {
  const real = process.env.CAPABILITY_TEST_DATABASE_URL
    ? await postgresSessions(process.env.CAPABILITY_TEST_DATABASE_URL)
    : null;
  const { pg, db } = real
    ? {
        pg: {
          exec: (text: string) => real.pool.query(text),
          close: real.close,
        },
        db: real.db,
      }
    : await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1),('outsider','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.exec(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Commercial','private')",
  );
  const objects = new Map<string, Uint8Array>();
  const files = createFiles({
    ...createPostgresFileDependencies(db, {
      async putVerified(revision: FileRevision, bytes: Uint8Array) {
        objects.set(revision.id, bytes);
      },
      async readVerified(revision: FileRevision) {
        const bytes = objects.get(revision.id);
        if (!bytes) throw new Error("Missing synthetic source bytes");
        return bytes;
      },
    }),
    now: () => 10,
  });
  const fileId = randomUUID();
  const uploaded = await files.upload(
    "owner",
    {
      repositoryId: "repo",
      fileId,
      requestId: randomUUID(),
      expectedVersion: 0,
      name: "synthetic.pdf",
      mediaType: "application/pdf",
    },
    new TextEncoder().encode("synthetic source"),
  );
  const evidenceContext = {
    ...context,
    source: { fileId, fileRevisionId: uploaded.file.revisionId, sha256: uploaded.file.sha256 },
  };
  let reads = 0;
  const source = {
    async readDraftInput() {
      reads++;
      return { content: draft(), evidenceContext };
    },
  };
  const docs = createPostgresCommercialDocuments(db, source, createPostgresFileRevisionQualifier);
  const command = {
    commandId: randomUUID(),
    repositoryId: "repo",
    documentId: randomUUID(),
    expectedVersion: 0,
    extractionResultId: id,
  };
  await pg.exec(
    "ALTER TABLE app_private.commercial_document_commands RENAME TO temporarily_unavailable_commands",
  );
  await assert.rejects(
    docs.createDraftFromExtraction({ actorUserId: "owner", traceId: randomUUID() }, command),
    { code: "DOCUMENT_STORE_NOT_READY" },
  );
  assert.equal(reads, 0);
  await pg.exec(
    "ALTER TABLE app_private.temporarily_unavailable_commands RENAME TO commercial_document_commands",
  );
  await pg.exec(
    "ALTER TABLE app_private.commercial_document_revisions RENAME COLUMN source_sha256 TO temporarily_unavailable_sha256",
  );
  await assert.rejects(
    docs.createDraftFromExtraction({ actorUserId: "owner", traceId: randomUUID() }, command),
    { code: "DOCUMENT_STORE_NOT_READY" },
  );
  assert.equal(reads, 0);
  await pg.exec(
    "ALTER TABLE app_private.commercial_document_revisions RENAME COLUMN temporarily_unavailable_sha256 TO source_sha256",
  );
  await pg.exec(
    "ALTER TABLE app_private.commercial_document_revisions ADD COLUMN unexpected_required integer NOT NULL",
  );
  await assert.rejects(
    docs.createDraftFromExtraction({ actorUserId: "owner", traceId: randomUUID() }, command),
    { code: "DOCUMENT_STORE_NOT_READY" },
  );
  assert.equal(reads, 0);
  await pg.exec(
    "ALTER TABLE app_private.commercial_document_revisions DROP COLUMN unexpected_required",
  );
  const receipt = await docs.createDraftFromExtraction(
    { actorUserId: "owner", traceId: randomUUID() },
    command,
  );
  assert.equal(receipt.documentVersion, 1);
  assert.deepEqual(
    await docs.receipt(
      "owner",
      { repositoryId: "repo", commandId: command.commandId },
      { documentId: command.documentId, expectedVersion: 0, extractionResultId: id },
    ),
    receipt,
  );
  await assert.rejects(
    docs.receipt(
      "owner",
      { repositoryId: "repo", commandId: command.commandId },
      { documentId: command.documentId, expectedVersion: 0, extractionResultId: randomUUID() },
    ),
    { code: "COMMAND_ID_CONFLICT" },
  );

  const saved = await docs.read("owner", { repositoryId: "repo", documentId: command.documentId });
  assert.equal(saved?.content.documentKind, "ESTIMATE");
  assert.equal(saved?.reviewState, "DRAFT");
  assert.deepEqual(saved?.content, draft());
  const sourceQuery = { repositoryId: "repo", fileId, fileRevisionId: uploaded.file.revisionId };
  assert.equal((await docs.readBySource("owner", sourceQuery))?.revisionId, receipt.revisionId);
  await assert.rejects(docs.readBySource("outsider", sourceQuery));
  await assert.rejects(docs.readBySource("owner", { ...sourceQuery, fileId: "not-a-uuid" }), {
    code: "INVALID_INPUT",
  });
  assert.equal(
    await docs.readBySource("owner", { ...sourceQuery, fileRevisionId: randomUUID() }),
    null,
  );

  assert.equal(saved?.content.rows[0]?.rowType, "ITEM");
  assert.equal(
    await docs
      .receipt("owner", { repositoryId: "repo", commandId: command.commandId })
      .then((r) => r?.revisionId),
    receipt.revisionId,
  );
  assert.deepEqual(
    await docs.createDraftFromExtraction({ actorUserId: "owner", traceId: randomUUID() }, command),
    receipt,
  );
  assert.equal(reads, 1); // Retry does not re-read/re-parse technical result.
  await assert.rejects(
    docs.createDraftFromExtraction(
      { actorUserId: "owner", traceId: randomUUID() },
      { ...command, documentId: randomUUID() },
    ),
    { code: "COMMAND_ID_CONFLICT" },
  );
  await assert.rejects(
    docs.read("outsider", { repositoryId: "repo", documentId: command.documentId }),
  );
  await pg.exec(
    `CREATE FUNCTION app_private.reject_commercial_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced commercial receipt failure'; END $$;CREATE TRIGGER reject_commercial_receipt BEFORE INSERT ON app_private.commercial_document_commands FOR EACH ROW EXECUTE FUNCTION app_private.reject_commercial_receipt();`,
  );
  const failed = { ...command, commandId: randomUUID(), documentId: randomUUID() };
  await assert.rejects(
    docs.createDraftFromExtraction({ actorUserId: "owner", traceId: randomUUID() }, failed),
    /forced commercial receipt failure/,
  );
  assert.equal(
    await docs.read("owner", { repositoryId: "repo", documentId: failed.documentId }),
    null,
  );
  await pg.exec(
    "DROP TRIGGER reject_commercial_receipt ON app_private.commercial_document_commands",
  );
  const simultaneous = await Promise.all(
    Array.from({ length: 5 }, () =>
      docs.createDraftFromExtraction({ actorUserId: "owner", traceId: randomUUID() }, failed),
    ),
  );
  assert.ok(simultaneous.every((value) => value.revisionId === simultaneous[0]?.revisionId));
  const recovered = await docs.createDraftFromExtraction(
    { actorUserId: "owner", traceId: randomUUID() },
    failed,
  );
  assert.equal(recovered.documentVersion, 1);
  assert.equal((await docs.readBySource("owner", sourceQuery))?.revisionId, recovered.revisionId);
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE commercial_document_revisions SET content=content WHERE revision_id=$1", [
        recovered.revisionId,
      ]),
    ),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "42501",
  );
});
