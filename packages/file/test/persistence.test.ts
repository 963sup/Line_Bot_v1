import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { createFiles } from "../src/application/use-cases/files.js";
import { createFileReclaimer } from "../src/application/use-cases/reclaim.js";
import {
  createPostgresFileDependencies,
  createPostgresFileReclamationDependencies,
  createPostgresFileRevisionQualifier,
} from "../src/composition/bootstrap/files.js";
import type { FileObjectRemoval, FileObjectStore } from "../src/contracts/output/object-store.js";
import { FileError } from "../src/domain/error.js";

const code = (expected: string) => (error: unknown) =>
  (error instanceof FileError && error.code === expected) ||
  (error instanceof Error && error.message === expected);
const bytes = new TextEncoder().encode("Quantity: 26 SET");
function deferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  if (!resolve) throw new Error("Promise executor did not initialize synchronously");
  return { promise, resolve };
}
function command() {
  return {
    repositoryId: "repo",
    fileId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    name: "source.txt",
    mediaType: "text/plain",
  };
}
async function seed(db: Database) {
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1),('member','active',1,1),('outsider','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login(id,'USER',id,1) FROM users");
  });
}
function memoryStore(): FileObjectStore & FileObjectRemoval {
  const contents = new Map<string, Uint8Array>();
  const key = (r: { repositoryId: string; fileId: string; id: string }) =>
    `${r.repositoryId}:${r.fileId}:${r.id}`;
  return {
    async putVerified(revision, input) {
      const previous = contents.get(key(revision));
      if (previous) {
        assert.deepEqual(previous, input);
        return;
      }
      contents.set(key(revision), Uint8Array.from(input));
    },
    async readVerified(revision) {
      const stored = contents.get(key(revision));
      if (!stored) throw new FileError(503, "Missing test object.", "UNAVAILABLE");
      return Uint8Array.from(stored);
    },
    async removeVerified(revision) {
      contents.delete(key(revision));
    },
  };
}
function intake(db: Database, objects: FileObjectStore) {
  const files = createFiles({ ...createPostgresFileDependencies(db, objects), now: () => 100 });
  return files;
}

test("PostgreSQL File storage preserves protected objects, exact replay and historical source revisions", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','public')",
  );
  await pg.query(
    "SELECT * FROM app_private.provision_repository('other','owner','owner','USER','Other','private')",
  );
  const objects = memoryStore();
  const files = intake(db, objects);
  const c = command();
  const first = await files.upload("owner", c, bytes);
  const reference = {
    fileId: c.fileId,
    fileRevisionId: first.file.revisionId,
    fileSha256: first.file.sha256,
  };
  await db.transaction((sql) =>
    createPostgresFileRevisionQualifier(sql).verify("owner", "repo", reference),
  );
  await assert.rejects(
    db.transaction((sql) =>
      createPostgresFileRevisionQualifier(sql).verify("owner", "repo", {
        ...reference,
        fileSha256: "0".repeat(64),
      }),
    ),
    code("SOURCE_INVALID"),
  );
  await assert.rejects(
    db.transaction((sql) =>
      createPostgresFileRevisionQualifier(sql).verify("outsider", "repo", reference),
    ),
    code("FORBIDDEN"),
  );
  assert.deepEqual(await files.upload("owner", c, bytes), first);
  assert.deepEqual(
    (await files.source("owner", "repo", c.fileId, first.file.revisionId)).bytes,
    bytes,
  );
  assert.equal((await files.list("owner", "repo")).files.length, 1);
  assert.equal((await files.overview("owner", "repo")).files.length, 1);
  // Reading File metadata never requires creating a private Storage client.
  const metadataOnly = createFiles({
    ...createPostgresFileDependencies(db),
    now: () => 100,
  });
  assert.equal((await metadataOnly.list("owner", "repo")).files.length, 1);
  // One immutable metadata source, not a second PostgreSQL bytea copy.
  const metadata = (
    await db.transaction((sql) =>
      sql.query("SELECT * FROM file_revisions WHERE repository_id=$1 AND file_id=$2", [
        "repo",
        c.fileId,
      ]),
    )
  ).rows[0];
  assert.ok(metadata);
  assert.equal(Object.hasOwn(metadata, "payload"), false);
  await assert.rejects(files.file("outsider", "repo", c.fileId), code("FORBIDDEN"));
  await assert.rejects(
    files.source("outsider", "repo", c.fileId, first.file.revisionId),
    code("FORBIDDEN"),
  );
  await assert.rejects(files.file("owner", "other", c.fileId), code("NOT_FOUND"));
  await assert.rejects(
    files.upload("owner", { ...c, name: "changed.txt" }, bytes),
    code("REQUEST_ID_REUSED"),
  );
  const later = await files.upload(
    "owner",
    { ...c, requestId: randomUUID(), expectedVersion: 1 },
    new TextEncoder().encode("Changed"),
  );
  assert.equal(later.file.version, 2);
  assert.deepEqual(
    (await files.source("owner", "repo", c.fileId, first.file.revisionId)).bytes,
    bytes,
  );
  for (const table of ["file_revisions", "file_upload_intents", "file_commands"])
    await assert.rejects(db.transaction((sql) => sql.query(`DELETE FROM ${table}`)));
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("UPDATE repository_files SET repository_id='other' WHERE id=$1", [c.fileId]),
    ),
  );
  await pg.query("UPDATE app_private.repositories SET is_archived=true WHERE id='repo'");
  assert.deepEqual(await files.upload("owner", c, bytes), first);
  await assert.rejects(
    files.upload("owner", { ...c, requestId: randomUUID(), expectedVersion: 2 }, bytes),
    code("LIFECYCLE_CONFLICT"),
  );
});

test("failed File upload receipts roll back metadata and revocation blocks upload completion", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','member','write',1)",
  );
  const objects = memoryStore();
  const files = intake(db, objects);
  const c = command();
  const receiptFailure = Object.assign(new Error("injected receipt failure"), { code: "42P01" });
  const failedDb: Database = {
    transaction: (work) =>
      db.transaction((sql) =>
        work(
          createSql((text, values) => {
            if (text.includes("INSERT INTO file_commands")) throw receiptFailure;
            return sql.query(text, values);
          }),
        ),
      ),
  };
  await assert.rejects(
    intake(failedDb, objects).upload("owner", c, bytes),
    (error) => error === receiptFailure,
  );
  assert.equal((await files.list("owner", "repo")).files.length, 0);
  assert.equal(
    (
      await db.transaction((sql) =>
        sql.query("SELECT * FROM file_upload_intents WHERE actor_user_id=$1 AND request_id=$2", [
          "owner",
          c.requestId,
        ]),
      )
    ).rows.length,
    1,
  );
  const first = await files.upload("member", c, bytes);
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='member'",
  );
  await assert.rejects(files.upload("member", c, bytes));
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','member','write',1)",
  );
});

const url = process.env.CAPABILITY_TEST_DATABASE_URL;
test("native sessions serialize duplicate File uploads and fence obsolete external completion", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(url);
  t.after(close);
  await seed(db);
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const objects = memoryStore();
  const files = intake(db, objects);
  const c = command();
  const uploads = await Promise.all([
    files.upload("owner", c, bytes),
    files.upload("owner", c, bytes),
  ]);
  assert.deepEqual(uploads[0], uploads[1]);
  assert.ok(uploads[0]);
  const edits = await Promise.allSettled([
    files.upload("owner", { ...c, requestId: randomUUID(), expectedVersion: 1 }, bytes),
    files.upload("owner", { ...c, requestId: randomUUID(), expectedVersion: 1 }, bytes),
  ]);
  assert.equal(edits.filter((r) => r.status === "fulfilled").length, 1);
});

test("lost Storage result leaves an invisible durable intent and exact retry finalizes it", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const objects = memoryStore();
  let first = true;
  const storageFailure = new Error("sensitive unknown Storage provider result");
  const uncertain: FileObjectStore = {
    ...objects,
    async putVerified(revision, bytes) {
      await objects.putVerified(revision, bytes);
      if (first) {
        first = false;
        throw storageFailure;
      }
    },
  };
  const commandInput = { ...command(), name: "  source.txt  ", mediaType: " TEXT/PLAIN " };
  const files = intake(db, uncertain);
  await assert.rejects(
    files.upload("owner", commandInput, bytes),
    (error) => error === storageFailure,
  );
  assert.equal((await files.list("owner", "repo")).files.length, 0);
  const pending = await files.pendingUploads("owner", "repo");
  assert.equal(pending.uploads.length, 1);
  assert.equal(pending.uploads[0]?.requestId, commandInput.requestId);
  assert.equal(pending.uploads[0]?.sha256.length, 64);
  await assert.rejects(files.pendingUploads("member", "repo"), code("FORBIDDEN"));
  await assert.rejects(files.pendingUploads("outsider", "repo"), code("FORBIDDEN"));
  const committed = await files.upload("owner", commandInput, bytes);
  assert.equal(committed.file.version, 1);
  assert.equal((await files.list("owner", "repo")).files.length, 1);
  assert.deepEqual((await files.pendingUploads("owner", "repo")).uploads, []);
  assert.deepEqual(
    (await files.source("owner", "repo", commandInput.fileId, committed.file.revisionId)).bytes,
    bytes,
  );
  assert.deepEqual(
    await files.upload(
      "owner",
      { ...commandInput, name: pending.uploads[0]?.name, mediaType: pending.uploads[0]?.mediaType },
      bytes,
    ),
    committed,
  );
});

test("Repository access revoked during Storage I/O prevents Finalize; original intent stays private", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','member','write',1)",
  );
  const objects = memoryStore();
  const revoking: FileObjectStore = {
    ...objects,
    async putVerified(revision, bytes) {
      await objects.putVerified(revision, bytes);
      await pg.query(
        "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='member'",
      );
    },
  };
  const c = command();
  const files = intake(db, revoking);
  await assert.rejects(files.upload("member", c, bytes), code("FORBIDDEN"));
  assert.equal((await files.list("owner", "repo")).files.length, 0);
  await assert.rejects(files.upload("member", c, bytes), code("FORBIDDEN"));
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','member','write',1)",
  );
  const result = await intake(db, objects).upload("member", c, bytes);
  assert.equal(result.file.version, 1);
});

test("trusted orphan reclamation quarantines only quiet never-committed Upload Intents", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const objects = memoryStore();
  const deps = createPostgresFileReclamationDependencies(db, objects);
  const files = intake(db, objects);
  const committedCommand = command();
  const committed = await files.upload("owner", committedCommand, bytes);
  const orphanCommand = command();
  const storageFailure = new Error("unknown provider result");
  const lost: FileObjectStore = {
    ...objects,
    async putVerified(revision, input) {
      await objects.putVerified(revision, input);
      throw storageFailure;
    },
  };
  await assert.rejects(
    intake(db, lost).upload("owner", orphanCommand, bytes),
    (error) => error === storageFailure,
  );
  const reclaimer = createFileReclaimer({ ...deps, beforeMutation: async () => {} });
  const cutoff = Date.now();
  assert.equal((await reclaimer.plan(cutoff)).candidates, 0);
  await pg.query(
    "UPDATE app_private.file_upload_intents SET last_attempt_at=clock_timestamp()-interval '8 days' WHERE request_id=$1",
    [orphanCommand.requestId],
  );
  assert.equal((await reclaimer.plan(cutoff)).candidates, 1);
  const result = await reclaimer.reclaim(cutoff);
  assert.deepEqual(result, { examined: 1, absenceVerified: 1, skipped: 0, pageFull: false });
  assert.equal((await reclaimer.plan(cutoff)).candidates, 1);
  assert.deepEqual((await files.pendingUploads("owner", "repo")).uploads, []);
  await assert.rejects(files.upload("owner", orphanCommand, bytes), code("LIFECYCLE_CONFLICT"));
  assert.deepEqual(
    (await files.source("owner", "repo", committedCommand.fileId, committed.file.revisionId)).bytes,
    bytes,
  );
  const state = (
    await db.transaction((sql) =>
      sql.query("SELECT abandoned_at,reclaimed_at FROM file_upload_intents WHERE request_id=$1", [
        orphanCommand.requestId,
      ]),
    )
  ).rows[0];
  assert.ok(state?.abandoned_at);
  assert.ok(state.reclaimed_at);
});

test("failed object deletion leaves a durable quarantine for an explicit guarded retry", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const c = command();
  const objects = memoryStore();
  const deps = createPostgresFileReclamationDependencies(db, objects);
  const storageFailure = new Error("unknown upload");
  const lost: FileObjectStore = {
    ...objects,
    async putVerified(revision, input) {
      await objects.putVerified(revision, input);
      throw storageFailure;
    },
  };
  const files = intake(db, lost);
  await assert.rejects(files.upload("owner", c, bytes), (error) => error === storageFailure);
  await pg.query(
    "UPDATE app_private.file_upload_intents SET last_attempt_at=clock_timestamp()-interval '8 days' WHERE request_id=$1",
    [c.requestId],
  );
  const reclaimer = createFileReclaimer({ ...deps, beforeMutation: async () => {} });
  const refused = createFileReclaimer({
    ...deps,
    objects: () => ({
      ...objects,
      async removeVerified() {
        throw new Error("unknown delete");
      },
    }),
    beforeMutation: async () => {},
  });
  await assert.rejects(refused.reclaim(Date.now()), /unknown delete/);
  assert.equal((await reclaimer.plan(Date.now())).candidates, 1);
  await assert.rejects(files.upload("owner", c, bytes), code("LIFECYCLE_CONFLICT"));
  assert.equal((await reclaimer.reclaim(Date.now())).absenceVerified, 1);
  assert.equal((await reclaimer.plan(Date.now())).candidates, 1);
});

test("late object completion after reclamation remains executable recovery work", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const c = command();
  const objects = memoryStore();
  const writeAllowed = deferred();
  const writeStarted = deferred();
  const delayed: FileObjectStore = {
    ...objects,
    async putVerified(revision, input) {
      writeStarted.resolve();
      await writeAllowed.promise;
      await objects.putVerified(revision, input);
    },
  };
  const upload = intake(db, delayed).upload("owner", c, bytes);
  try {
    await writeStarted.promise;
    await pg.query(
      "UPDATE app_private.file_upload_intents SET last_attempt_at=clock_timestamp()-interval '8 days' WHERE request_id=$1",
      [c.requestId],
    );
    const deps = createPostgresFileReclamationDependencies(db, objects);
    const revision = (await deps.maintenance.candidates(Date.now(), 7 * 24 * 60 * 60 * 1000))[0]
      ?.revision;
    assert.ok(revision);
    const reclaimer = createFileReclaimer({ ...deps, beforeMutation: async () => {} });
    assert.equal((await reclaimer.reclaim(Date.now())).absenceVerified, 1);

    writeAllowed.resolve();
    await assert.rejects(upload, code("LIFECYCLE_CONFLICT"));
    assert.deepEqual(await objects.readVerified(revision), bytes);

    assert.equal((await reclaimer.plan(Date.now())).candidates, 1);
    assert.equal((await reclaimer.reclaim(Date.now())).absenceVerified, 1);
    await assert.rejects(objects.readVerified(revision), code("UNAVAILABLE"));
  } finally {
    writeAllowed.resolve();
    await upload.catch(() => {});
  }
});

test("bounded reconciliation rotates verified absences before the next page", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const requestId = (index: number) =>
    `00000001-0000-4000-8000-${index.toString().padStart(12, "0")}`;
  const fileId = (index: number) => `00000002-0000-4000-8000-${index.toString().padStart(12, "0")}`;
  const revisionId = (index: number) =>
    `00000003-0000-4000-8000-${index.toString().padStart(12, "0")}`;
  for (let index = 1; index <= 21; index++) {
    await pg.query(
      `INSERT INTO app_private.file_upload_intents (
         actor_user_id,request_id,repository_id,file_id,revision_id,expected_version,
         parent_revision_id,at,name,media_type,byte_length,sha256,fingerprint,last_attempt_at
       ) VALUES ('owner',$1,'repo',$2,$3,0,NULL,100,'source.txt','text/plain',$4,$5,$6,
         clock_timestamp()-interval '8 days')`,
      [
        requestId(index),
        fileId(index),
        revisionId(index),
        bytes.byteLength,
        "a".repeat(64),
        "b".repeat(64),
      ],
    );
  }
  const objects = memoryStore();
  const deps = createPostgresFileReclamationDependencies(db, objects);
  const reclaimer = createFileReclaimer({ ...deps, beforeMutation: async () => {} });
  assert.deepEqual(await reclaimer.reclaim(Date.now()), {
    examined: 20,
    absenceVerified: 20,
    skipped: 0,
    pageFull: true,
  });

  const next = await deps.maintenance.candidates(Date.now(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(next.length, 20);
  assert.equal(next[0]?.requestId, requestId(21));
  const lateRevision = next[0]?.revision;
  assert.ok(lateRevision);
  await objects.putVerified(lateRevision, bytes);

  assert.equal((await reclaimer.reclaim(Date.now())).absenceVerified, 20);
  await assert.rejects(objects.readVerified(lateRevision), code("UNAVAILABLE"));
});

test("native sessions protect a renewed Upload Intent from a stale operator reclamation snapshot", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(url);
  t.after(close);
  await seed(db);
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const c = command();
  const objects = memoryStore();
  const storageFailure = new Error("provider result unknown");
  const unknown: FileObjectStore = {
    ...objects,
    async putVerified(revision, input) {
      await objects.putVerified(revision, input);
      throw storageFailure;
    },
  };
  await assert.rejects(
    intake(db, unknown).upload("owner", c, bytes),
    (error) => error === storageFailure,
  );
  await pool.query(
    "UPDATE app_private.file_upload_intents SET last_attempt_at=clock_timestamp()-interval '8 days' WHERE request_id=$1",
    [c.requestId],
  );
  const reclaimAllowed = deferred();
  const reclaimStarted = deferred();
  const storageAllowed = deferred();
  const storageStarted = deferred();
  const maintenance = createPostgresFileReclamationDependencies(db, objects);
  const reclaimer = createFileReclaimer({
    ...maintenance,
    beforeMutation: async () => {
      reclaimStarted.resolve();
      await reclaimAllowed.promise;
    },
  });
  const reclaimed = reclaimer.reclaim(Date.now());
  try {
    await reclaimStarted.promise;
    const pending: FileObjectStore = {
      ...objects,
      async putVerified(revision, input) {
        storageStarted.resolve();
        await storageAllowed.promise;
        await objects.putVerified(revision, input);
      },
    };
    const restored = intake(db, pending).upload("owner", c, bytes);
    try {
      await storageStarted.promise;
      // The Upload transaction has renewed its DB clock and committed before provider I/O.
      reclaimAllowed.resolve();
      assert.deepEqual(await reclaimed, {
        examined: 1,
        absenceVerified: 0,
        skipped: 1,
        pageFull: false,
      });
      storageAllowed.resolve();
      const committed = await restored;
      assert.equal(committed.file.version, 1);
      assert.deepEqual((await intake(db, objects).list("owner", "repo")).files.length, 1);
    } finally {
      storageAllowed.resolve();
      await restored.catch(() => {});
    }
  } finally {
    reclaimAllowed.resolve();
    await reclaimed.catch(() => {});
  }
});

test("native sessions keep a late object write reconcilable after an earlier absence", {
  skip: !url && !process.env.CI,
}, async (t) => {
  assert.ok(url, "CI requires its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(url);
  t.after(close);
  await seed(db);
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const c = command();
  const objects = memoryStore();
  const writeAllowed = deferred();
  const writeStarted = deferred();
  const delayed: FileObjectStore = {
    ...objects,
    async putVerified(revision, input) {
      writeStarted.resolve();
      await writeAllowed.promise;
      await objects.putVerified(revision, input);
    },
  };
  const upload = intake(db, delayed).upload("owner", c, bytes);
  try {
    await writeStarted.promise;
    await pool.query(
      "UPDATE app_private.file_upload_intents SET last_attempt_at=clock_timestamp()-interval '8 days' WHERE request_id=$1",
      [c.requestId],
    );
    const deps = createPostgresFileReclamationDependencies(db, objects);
    const reclaimer = createFileReclaimer({ ...deps, beforeMutation: async () => {} });
    assert.equal((await reclaimer.reclaim(Date.now())).absenceVerified, 1);

    writeAllowed.resolve();
    await assert.rejects(upload, code("LIFECYCLE_CONFLICT"));
    assert.equal((await reclaimer.plan(Date.now())).candidates, 1);
    assert.equal((await reclaimer.reclaim(Date.now())).absenceVerified, 1);
  } finally {
    writeAllowed.resolve();
    await upload.catch(() => {});
  }
});

test("signed upload commits only verified exact bytes and replays across transports", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await seed(db);
  await pg.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const original = memoryStore();
  let signedRevision: Parameters<FileObjectStore["putVerified"]>[0] | undefined;
  const objects: FileObjectStore = {
    ...original,
    async signUpload(revision) {
      signedRevision = revision;
      return "https://test.supabase.co/storage/v1/object/upload/sign/repository-files/key?token=opaque";
    },
  };
  const files = intake(db, objects);
  const c = command();
  const direct = {
    ...c,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  await assert.rejects(files.prepareUpload("outsider", direct), code("FORBIDDEN"));
  const prepared = await files.prepareUpload("owner", direct);
  assert.equal(prepared.requestId, c.requestId);
  assert.ok("signedUrl" in prepared);
  assert.ok(signedRevision);
  assert.equal((await files.pendingUploads("owner", "repo")).uploads.length, 1);
  assert.equal((await files.overview("owner", "repo")).uploads.length, 1);
  assert.deepEqual((await files.list("owner", "repo")).files, []);
  await assert.rejects(files.completeUpload("owner", direct), code("UNAVAILABLE"));
  await assert.rejects(
    files.prepareUpload("owner", { ...direct, sha256: "0".repeat(64) }),
    code("REQUEST_ID_REUSED"),
  );
  await original.putVerified(signedRevision, bytes);
  const receipt = await files.completeUpload("owner", direct);
  assert.equal(receipt.file.sha256, direct.sha256);
  assert.equal(receipt.file.version, 1);
  assert.deepEqual(await files.completeUpload("owner", direct), receipt);
  assert.deepEqual(await files.prepareUpload("owner", direct), receipt);
  assert.deepEqual(await files.upload("owner", c, bytes), receipt);
  assert.equal((await files.list("owner", "repo")).files.length, 1);
  await assert.rejects(files.completeUpload("outsider", direct), code("FORBIDDEN"));
  const blocked = command();
  const competing = {
    ...blocked,
    fileId: c.fileId,
    byteLength: direct.byteLength,
    sha256: direct.sha256,
  };
  await assert.rejects(files.prepareUpload("owner", competing), code("VERSION_CONFLICT"));
});
