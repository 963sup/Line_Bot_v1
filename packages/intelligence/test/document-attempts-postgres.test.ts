import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import {
  createPostgresFileDependencies,
  createPostgresFileRevisionQualifier,
  createPostgresLegacyProcessingHistory,
} from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileRevision } from "@line_bot_v1/file/domain/file";
import type { Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresDocumentAttempts } from "../src/adapters/outbound/persistence/document-attempts.js";
import { PostgresIntelligenceProcessing } from "../src/adapters/outbound/persistence/processing.js";
import { DocumentAttemptError } from "../src/contracts/output/document-attempts.js";

function objects() {
  const stored = new Map<string, Uint8Array>();
  return {
    async putVerified(revision: FileRevision, bytes: Uint8Array) {
      stored.set(revision.id, Uint8Array.from(bytes));
    },
    async readVerified(revision: FileRevision) {
      const bytes = stored.get(revision.id);
      if (!bytes) throw new Error("Missing test object.");
      return Uint8Array.from(bytes);
    },
  };
}

async function source(db: Database) {
  const files = createFiles({ ...createPostgresFileDependencies(db, objects()), now: () => 1 });
  const fileId = randomUUID();
  const upload = await files.upload(
    "owner",
    {
      repositoryId: "repo",
      fileId,
      requestId: randomUUID(),
      expectedVersion: 0,
      name: "source.pdf",
      mediaType: "application/pdf",
    },
    new TextEncoder().encode("technical attempt source"),
  );
  return { fileId, fileRevisionId: upload.file.revisionId, fileSha256: upload.file.sha256 };
}

const hasCode = (code: string) => (error: unknown) =>
  error instanceof DocumentAttemptError && error.code === code;

test("PostgreSQL attempt receipt reserves once, fences completions and never reruns an unknown request", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1),('outsider','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Intake','private')",
  );
  const attempts = createPostgresDocumentAttempts(createPostgresFileRevisionQualifier, db);
  const pinned = await source(db);
  const input = {
    requestId: randomUUID(),
    repositoryId: "repo",
    source: pinned,
    intentFingerprint: "a".repeat(64),
  };

  const first = await attempts.reserve("owner", input);
  assert.equal(first.fresh, true);
  assert.deepEqual(await attempts.reserve("owner", input), { id: first.id, fresh: false });
  await assert.rejects(
    attempts.reserve("owner", { ...input, intentFingerprint: "b".repeat(64) }),
    hasCode("REQUEST_ID_REUSED"),
  );
  await assert.rejects(attempts.reserve("outsider", input));

  await attempts.unknown("owner", { ...input, id: first.id });
  assert.deepEqual(await attempts.reserve("owner", input), { id: first.id, fresh: false });
  await assert.rejects(
    attempts.complete(
      "owner",
      { ...input, id: randomUUID() },
      {
        documentId: randomUUID(),
        revisionId: randomUUID(),
      },
    ),
    hasCode("ATTEMPT_FENCED"),
  );
  const target = {
    documentId: "contract-document:external-42",
    revisionId: "revision:external-11",
  };
  await attempts.complete("owner", { ...input, id: first.id }, target);
  await attempts.complete("owner", { ...input, id: first.id }, target);
  await attempts.unknown("owner", { ...input, id: first.id });
  await assert.rejects(
    attempts.complete(
      "owner",
      { ...input, id: first.id },
      {
        documentId: randomUUID(),
        revisionId: randomUUID(),
      },
    ),
    hasCode("COMPLETION_CONFLICT"),
  );
  const row = await db.transaction((sql) =>
    sql.query(
      "SELECT state,target_document_id,target_revision_id FROM intelligence_document_intakes WHERE id=$1",
      [first.id],
    ),
  );
  assert.deepEqual(row.rows[0], {
    state: "COMPLETED",
    target_document_id: target.documentId,
    target_revision_id: target.revisionId,
  });
});

test("Intelligence is the authorized read owner of immutable legacy processing history", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1),('outsider','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Intake','private')",
  );
  const pinned = await source(db);
  const runId = randomUUID();
  const initialRevisionId = randomUUID();
  const revisionId = randomUUID();
  const attemptId = randomUUID();
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO file_processing_runs(id,repository_id,file_id,file_revision_id,version,head_revision_id)
       VALUES($1,'repo',$2,$3,2,$4)`,
      [runId, pinned.fileId, pinned.fileRevisionId, revisionId],
    );
    await sql.query(
      `INSERT INTO file_processing_revisions(id,run_id,repository_id,file_id,file_revision_id,file_sha256,version,parent_revision_id,actor_user_id,at,state,attempt_id,processor_id,processor_version,processor_kind,raw_result,saved_result,edits,failure)
       VALUES($1,$2,'repo',$3,$4,$5,1,NULL,'owner',1,'RUNNING',$6,'legacy-parser','v1','parser',NULL,NULL,'[]'::jsonb,NULL)`,
      [
        initialRevisionId,
        runId,
        pinned.fileId,
        pinned.fileRevisionId,
        pinned.fileSha256,
        attemptId,
      ],
    );
    await sql.query(
      `INSERT INTO file_processing_revisions(id,run_id,repository_id,file_id,file_revision_id,file_sha256,version,parent_revision_id,actor_user_id,at,state,attempt_id,processor_id,processor_version,processor_kind,raw_result,saved_result,edits,failure)
       VALUES($1,$2,'repo',$3,$4,$5,2,$6,'owner',2,'SAVED',$7,'legacy-parser','v1','parser',$8::jsonb,$9::jsonb,'[]'::jsonb,NULL)`,
      [
        revisionId,
        runId,
        pinned.fileId,
        pinned.fileRevisionId,
        pinned.fileSha256,
        initialRevisionId,
        attemptId,
        JSON.stringify({
          documentKind: "legacy-text",
          observations: [
            { id: "line-1", label: "Source line", value: "retained", uncertain: false },
          ],
        }),
        JSON.stringify({
          documentKind: "legacy-text",
          observations: [
            { id: "line-1", label: "Source line", value: "retained", uncertain: false },
          ],
        }),
      ],
    );
  });

  const store = new PostgresIntelligenceProcessing(
    createPostgresFileRevisionQualifier,
    db,
    createPostgresLegacyProcessingHistory(db),
  );
  const read = await store.read("owner", "repo", runId);
  assert.equal(read?.id, revisionId);
  assert.equal(read?.savedResult?.observations[0]?.value, "retained");
  const listed = await store.list("owner", "repo", pinned.fileId);
  assert.deepEqual(
    listed.runs.map((item) => item.id),
    [revisionId],
  );
  await assert.rejects(store.read("outsider", "repo", runId));
});
