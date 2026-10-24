import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { postgresSessions } from "@line_bot_v1/platform/testing/postgres-sessions";
import { claimScopedName } from "../src/postgres.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;

test("PostgreSQL serializes concurrent scoped claims and rename collisions", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must supply its disposable PostgreSQL service");
  const { db, pool, close, waitForBlocked } = await postgresSessions(databaseUrl);
  t.after(close);
  await pool.query(`
      INSERT INTO app_private.users(id,status,"createdAt") VALUES('owner','active',1);
      SELECT app_private.claim_account_login('owner','USER','owner',1);
      SELECT * FROM app_private.provision_repository(
        'namespace-repo','owner','owner','USER','Namespace','private'
      );
      SELECT * FROM app_private.provision_repository(
        'namespace-repo-2','owner','owner','USER','Independent','private'
      );
    `);
  const at = Date.now() + 10_000;
  const scope = {
    family: "repository-label" as const,
    scopeKind: "REPOSITORY" as const,
    scopeId: "namespace-repo",
    targetKind: "LABEL" as const,
  };

  const claimA = await pool.connect();
  const claimB = await pool.connect();
  try {
    await claimA.query(
      "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog",
    );
    const claimAPid = (await claimA.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
      .rows[0]?.pid;
    assert.ok(claimAPid);
    await claimA.query(
      "SELECT * FROM app_private.claim_scoped_namespace_name('repository-label','REPOSITORY','namespace-repo','LABEL','label-a','Shared',$1)",
      [at],
    );

    const independent = db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO repository_labels(id,repository_id,name,color,version) VALUES('label-independent','namespace-repo-2','Independent label','abcdef',1)",
      );
      return claimScopedName(sql, {
        ...scope,
        scopeId: "namespace-repo-2",
        targetId: "label-independent",
        name: "Independent label",
        at,
      });
    });
    const independentCompleted = await Promise.race([
      independent.then(() => true),
      setTimeout(2_000, false),
    ]);
    assert.equal(
      independentCompleted,
      true,
      "an independent Namespace must complete before the blocked claim commits",
    );
    await independent;

    const blockedClaim = (async () => {
      await claimB.query(
        "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog",
      );
      try {
        await claimB.query(
          "SELECT * FROM app_private.claim_scoped_namespace_name('repository-label','REPOSITORY','namespace-repo','LABEL','label-b','Shared',$1)",
          [at],
        );
        await claimB.query(
          "INSERT INTO repository_labels(id,repository_id,name,color,version) VALUES('label-b','namespace-repo','Shared','00ff00',1)",
        );
        await claimB.query("COMMIT");
      } catch (error) {
        await claimB.query("ROLLBACK");
        throw error;
      }
    })();
    const claimWaiters = await waitForBlocked(claimAPid);
    assert.equal(claimWaiters.length, 1);
    assert.equal(claimWaiters[0]?.wait_event, "advisory");
    await claimA.query(
      "INSERT INTO repository_labels(id,repository_id,name,color,version) VALUES('label-a','namespace-repo','Shared','ff0000',1)",
    );
    await Promise.all([assert.rejects(blockedClaim), claimA.query("COMMIT")]);
  } finally {
    await claimA.query("ROLLBACK").catch(() => {});
    await claimB.query("ROLLBACK").catch(() => {});
    claimA.release();
    claimB.release();
  }

  await Promise.all([
    db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO repository_labels(id,repository_id,name,color,version) VALUES('label-c','namespace-repo','First','0000ff',1)",
      );
      return claimScopedName(sql, { ...scope, targetId: "label-c", name: "First", at: at + 1 });
    }),
    db.transaction(async (sql) => {
      await sql.query(
        "INSERT INTO repository_labels(id,repository_id,name,color,version) VALUES('label-d','namespace-repo','Second','ffff00',1)",
      );
      return claimScopedName(sql, { ...scope, targetId: "label-d", name: "Second", at: at + 1 });
    }),
  ]);
  const renameA = await pool.connect();
  const renameB = await pool.connect();
  try {
    await renameA.query(
      "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog",
    );
    const renameAPid = (await renameA.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
      .rows[0]?.pid;
    assert.ok(renameAPid);
    await renameA.query(
      "SELECT * FROM app_private.rename_scoped_namespace_name('repository-label','REPOSITORY','namespace-repo','LABEL','label-c','First','Collision',$1)",
      [at + 2],
    );
    await renameA.query(
      "UPDATE repository_labels SET name='Collision',version=version+1 WHERE id='label-c'",
    );

    const blockedRename = (async () => {
      await renameB.query(
        "BEGIN;SET LOCAL ROLE line_app;SET LOCAL search_path=app_private,pg_catalog",
      );
      try {
        await renameB.query(
          "SELECT * FROM app_private.rename_scoped_namespace_name('repository-label','REPOSITORY','namespace-repo','LABEL','label-d','Second','Collision',$1)",
          [at + 2],
        );
        await renameB.query(
          "UPDATE repository_labels SET name='Collision',version=version+1 WHERE id='label-d'",
        );
        await renameB.query("COMMIT");
      } catch (error) {
        await renameB.query("ROLLBACK");
        throw error;
      }
    })();
    const renameWaiters = await waitForBlocked(renameAPid);
    assert.equal(renameWaiters.length, 1);
    assert.equal(renameWaiters[0]?.wait_event, "advisory");
    await Promise.all([assert.rejects(blockedRename), renameA.query("COMMIT")]);
  } finally {
    await renameA.query("ROLLBACK").catch(() => {});
    await renameB.query("ROLLBACK").catch(() => {});
    renameA.release();
    renameB.release();
  }
});
