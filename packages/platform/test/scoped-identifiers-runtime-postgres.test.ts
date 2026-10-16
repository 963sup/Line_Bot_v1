import assert from "node:assert/strict";
import test from "node:test";
import { postgresSessions } from "../src/testing/postgres-sessions.js";

const databaseUrl = process.env.CAPABILITY_TEST_DATABASE_URL;

test("native PostgreSQL keeps runtime writers frozen across transactions until operator activation", {
  skip: !databaseUrl && !process.env.CI,
  timeout: 60_000,
}, async (t) => {
  assert.ok(databaseUrl, "CI must provide its disposable PostgreSQL service");
  const { pool, db, close } = await postgresSessions(databaseUrl);
  t.after(close);
  const revision = "c".repeat(40);
  await pool.query("SELECT app_private.cutover_scoped_identifiers($1,1)", [revision]);
  // Administrative fixture writes retain every projection constraint while the runtime is frozen.
  await pool.query(`DO $fixture$ BEGIN
    INSERT INTO app_private.users(id,status,"createdAt") VALUES('freeze-owner','active',1);
    PERFORM app_private.claim_account_login('freeze-owner','USER','freeze-owner',1);
  END $fixture$`);
  for (const id of ["old-runtime-attempt", "new-runtime-attempt"]) {
    await assert.rejects(
      db.transaction((sql) =>
        sql.query(
          "SELECT * FROM app_private.provision_enterprise_scope($1,'freeze-owner',$1,'Frozen',2)",
          [id],
        ),
      ),
      /scoped_identifier_writes_frozen_until_runtime_ready/,
    );
  }
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM app_private.enterprises")).rows[0]?.count,
    0,
  );
  await assert.rejects(
    db.transaction((sql) =>
      sql.query("SELECT app_private.activate_scoped_identifier_runtime($1,3)", [revision]),
    ),
    /permission denied/,
  );
  await pool.query("SELECT app_private.activate_scoped_identifier_runtime($1,3)", [revision]);
  await db.transaction((sql) =>
    sql.query(
      "SELECT * FROM app_private.provision_enterprise_scope('ready-enterprise','freeze-owner','ready-enterprise','Ready',4)",
    ),
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM app_private.enterprises")).rows[0]?.count,
    1,
  );
  await pool.query("SELECT app_private.assert_scoped_identifier_parity()");
});
