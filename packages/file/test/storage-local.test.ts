import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { supabaseFileObjects } from "../src/adapters/outbound/storage/supabase.js";
import { createFiles } from "../src/application/use-cases/files.js";
import { createPostgresFileDependencies } from "../src/composition/bootstrap/files.js";
import { nextFileRevision } from "../src/domain/file.js";

test("local Supabase signed PUT verifies bytes, refuses replacement and commits an exact replay", {
  skip: process.env.FILE_STORAGE_INTEGRATION !== "1",
}, async (t) => {
  const url = process.env.SUPABASE_URL ?? "";
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
    "Only local Storage is allowed",
  );
  const { db, pool, close } = await postgresSessions(
    process.env.CAPABILITY_TEST_DATABASE_URL ?? "",
  );
  t.after(close);
  await db.transaction(async (sql) => {
    await sql.query(
      `INSERT INTO users(id,status,status_version,"createdAt") VALUES('owner','active',1,1)`,
    );
    await sql.query("SELECT claim_account_login('owner','USER','owner',1)");
  });
  await pool.query(
    "SELECT * FROM app_private.provision_repository('repo','owner','owner','USER','Files','private')",
  );
  const objects = supabaseFileObjects({
    url,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });
  const files = createFiles({ ...createPostgresFileDependencies(db, objects), now: Date.now });
  const bytes = new TextEncoder().encode("local signed upload evidence");
  const command = {
    repositoryId: "repo",
    fileId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 0,
    name: "source.txt",
    mediaType: "text/plain",
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const ticket = await files.prepareUpload("owner", command);
  const { signedUrl, revisionId } = ticket;
  assert.ok(signedUrl);
  assert.ok(revisionId);
  const revision = nextFileRevision(null, 0, command.fileId, command, {
    id: revisionId,
    repositoryId: command.repositoryId,
    actorUserId: "owner",
    at: 1,
  });
  t.after(() => objects.removeVerified(revision));
  assert.equal((await files.overview("owner", "repo")).files.length, 0);
  await assert.rejects(files.completeUpload("owner", command));
  const put = () => {
    const body = new FormData();
    body.set("cacheControl", "0");
    body.append("", new Blob([bytes]), command.name);
    return fetch(signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
  };
  assert.equal((await put()).ok, true);
  assert.equal((await put()).ok, false, "A signed ticket must never replace stored evidence");
  const receipt = await files.completeUpload("owner", command);
  assert.equal(receipt.file.sha256, command.sha256);
  assert.deepEqual(await files.completeUpload("owner", command), receipt);
  assert.deepEqual(await files.prepareUpload("owner", command), receipt);
  assert.deepEqual((await files.source("owner", "repo", command.fileId, revisionId)).bytes, bytes);
  assert.equal((await files.overview("owner", "repo")).uploads.length, 0);
});
