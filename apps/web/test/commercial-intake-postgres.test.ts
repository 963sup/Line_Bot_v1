import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { normalizeCommercialDocument } from "@line_bot_v1/contract/application/normalization/commercial-document";
import { createPostgresCommercialDocuments } from "@line_bot_v1/contract/composition/bootstrap/commercial-documents";
import { createFiles } from "@line_bot_v1/file/application/use-cases/files";
import {
  createPostgresFileDependencies,
  createPostgresFileSourceReader,
  createPostgresFileRevisionQualifier,
} from "@line_bot_v1/file/composition/bootstrap/files";
import type { FileRevision } from "@line_bot_v1/file/domain/file";
import { createPostgresCommercialIntake } from "@line_bot_v1/intelligence/composition/bootstrap/commercial-intake";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";

// Provider is an external port; persistence, authorization, inspection and normalization are real.
test("commercial intake keeps technical result after target failure and resumes without another extraction", async (t) => {
  const real = process.env.CAPABILITY_TEST_DATABASE_URL
    ? await postgresSessions(process.env.CAPABILITY_TEST_DATABASE_URL)
    : null;
  const fixture = real
    ? { db: real.db, exec: (text: string) => real.pool.query(text), close: real.close }
    : await postgresFixture().then((value) => ({
        db: value.db,
        exec: (text: string) => value.pg.exec(text),
        close: () => value.pg.close(),
      }));
  t.after(() => fixture.close());
  await fixture.db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1),('outsider','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
  await fixture.exec(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Commercial','private')",
  );
  const objects = new Map<string, Uint8Array>();
  const files = createFiles({
    ...createPostgresFileDependencies(fixture.db, {
      async putVerified(revision: FileRevision, bytes: Uint8Array) {
        objects.set(revision.id, bytes);
      },
      async readVerified(revision: FileRevision) {
        const bytes = objects.get(revision.id);
        if (!bytes) throw new Error("Missing synthetic source");
        return bytes;
      },
    }),
    now: () => 10,
  });
  const bytes = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5X8AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const fileId = randomUUID();
  const uploaded = await files.upload(
    "owner",
    {
      repositoryId: "repo",
      fileId,
      requestId: randomUUID(),
      expectedVersion: 0,
      name: "synthetic.png",
      mediaType: "image/png",
    },
    bytes,
  );
  let calls = 0;
  let counts = 0;
  let intake: ReturnType<typeof createPostgresCommercialIntake> | undefined;
  const documents = createPostgresCommercialDocuments(fixture.db, {
    async readDraftInput(actor, scope) {
      if (!intake) throw new Error("Intake not composed");
      return normalizeCommercialDocument(await intake.readResult(actor, scope));
    },
  }, createPostgresFileRevisionQualifier);
  intake = createPostgresCommercialIntake({
    db: fixture.db,
    target: documents,
    qualifier: createPostgresFileRevisionQualifier,
    reader: createPostgresFileSourceReader(fixture.db, {
      async readVerified(revision: FileRevision) {
        const value = objects.get(revision.id);
        if (!value) throw new Error("Missing synthetic source");
        return value;
      },
    }),
    extractor: {
      async countInputTokens() {
        counts++;
        return 100;
      },
      async extract() {
        calls++;
        return {
          observations: [
            { pageNumber: 1, rawLabel: "Document type", rawValue: "ESTIMATE" },
            { pageNumber: 1, rawLabel: "Description", rawValue: "Synthetic work" },
            {
              pageNumber: 1,
              rawLabel: "Vendor note",
              rawValue: "Preserve this vendor-specific field",
            },
          ],
          semanticHints: [
            { observationIndex: 0, target: "documentKind", rowKey: null },
            { observationIndex: 1, target: "item.description", rowKey: "line-1" },
          ],
        };
      },
    },
  });
  const ctx = { actorUserId: "owner", traceId: randomUUID() };
  const command = {
    commandId: randomUUID(),
    repositoryId: "repo",
    source: { fileId, fileRevisionId: uploaded.file.revisionId, sha256: uploaded.file.sha256 },
    target: { documentId: randomUUID(), draftCommandId: randomUUID(), expectedDocumentVersion: 0 },
  };
  await fixture.exec(
    `CREATE FUNCTION app_private.fail_commercial_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23502', MESSAGE='forced target failure'; END $$;CREATE TRIGGER fail_commercial_save BEFORE INSERT ON app_private.commercial_document_commands FOR EACH ROW EXECUTE FUNCTION app_private.fail_commercial_save();`,
  );
  const failed = await intake.start(ctx, command);
  assert.equal(failed.state, "RESULT_READY");
  assert.equal(calls, 1);
  assert.ok(failed.extractionResultId);
  const result = await intake.readResult("owner", {
    repositoryId: "repo",
    extractionResultId: failed.extractionResultId,
  });
  assert.equal(result.observations.length, 3);
  assert.equal(
    await documents.read("owner", { repositoryId: "repo", documentId: command.target.documentId }),
    null,
  );
  await assert.rejects(
    intake.readResult("outsider", {
      repositoryId: "repo",
      extractionResultId: failed.extractionResultId,
    }),
  );
  await fixture.exec(
    "DROP TRIGGER fail_commercial_save ON app_private.commercial_document_commands",
  );
  const saved = await intake.resume(
    { ...ctx, traceId: randomUUID() },
    { repositoryId: "repo", commandId: command.commandId },
  );
  assert.equal(saved.state, "DRAFT_SAVED");
  assert.ok(saved.receipt);
  assert.equal(calls, 1);
  const read = await documents.read("owner", {
    repositoryId: "repo",
    documentId: command.target.documentId,
  });
  assert.equal(read?.content.documentKind, "ESTIMATE");
  assert.equal(
    (
      await documents.readBySource("owner", {
        repositoryId: "repo",
        fileId,
        fileRevisionId: uploaded.file.revisionId,
      })
    )?.revisionId,
    saved.receipt.revisionId,
  );
  const item = read?.content.rows.find((row) => row.rowType === "ITEM");
  assert.equal(item?.rowType === "ITEM" ? item.quantity.value : undefined, null);
  assert.ok(
    read?.content.extensionFields.some(
      (field) => field.value === "Preserve this vendor-specific field",
    ),
  );
  const again = await intake.start({ ...ctx, traceId: randomUUID() }, command);
  assert.deepEqual(again.receipt, saved.receipt);
  assert.equal(calls, 1);
  assert.equal(counts, 1);
});
