import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresEnterpriseGovernance } from "../src/composition/bootstrap/enterprise-governance.js";

const owner = { provider: "line:test", subject: "owner" };
const outsider = { provider: "line:test", subject: "outsider" };

function command(action: "deactivate" | "reactivate", expectedVersion: number, sequence: number) {
  return {
    action,
    enterpriseAccountId: "ent",
    requestId: `11111111-1111-4111-8111-${String(sequence).padStart(12, "0")}`,
    expectedVersion,
    reason: "test lifecycle",
  };
}

function failsWith(status: number, code: string) {
  return (error: unknown) =>
    error instanceof GovernanceAccessError && error.status === status && error.code === code;
}

async function fixture() {
  const fixture = await postgresFixture();
  await fixture.db.transaction(async (sql) => {
    for (const id of ["owner", "outsider"]) {
      await sql.query(
        "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES($1,'active',1,1)",
        [id],
      );
      await sql.query("SELECT app_private.claim_account_login($1,'USER',$1,1)", [id]);
    }
    await sql.query(
      "INSERT INTO user_identities(provider,subject,user_id) VALUES('line:test','owner','owner'),('line:test','outsider','outsider')",
    );
  });
  await fixture.pg.query("SELECT * FROM app_private.provision_enterprise_scope($1,$2,$3,$4,$5)", [
    "ent",
    "owner",
    "acme",
    "Acme",
    2,
  ]);
  return {
    ...fixture,
    governance: createPostgresEnterpriseGovernance(fixture.db, () => 100),
  };
}

test("lifecycle preserves membership, reactivates through current Owner and replays exact evidence", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const deactivate = command("deactivate", 1, 1);
  const inactive = await governance.execute(owner, deactivate);
  assert.equal(inactive.status, "inactive");
  assert.equal(inactive.version, 2);
  assert.deepEqual(await governance.execute(owner, deactivate), inactive);
  const reactivate = command("reactivate", 2, 2);
  const active = await governance.execute(owner, reactivate);
  assert.equal(active.status, "active");
  assert.equal(active.version, 3);
  assert.deepEqual(await governance.execute(owner, reactivate), active);
  await assert.rejects(
    governance.execute(owner, { ...reactivate, reason: "different content" }),
    failsWith(409, "replay-conflict"),
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM enterprise_direct_affiliations WHERE user_id='owner'",
      )
    ).rows,
    [{ status: "active", version: 1 }],
  );
  assert.equal((await pg.query("SELECT * FROM governance_command_receipts")).rows.length, 2);
  assert.equal((await pg.query("SELECT * FROM governance_audit_events")).rows.length, 2);
});

test("Domain lifecycle rejects stale versions and invalid transitions without durable effects", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await assert.rejects(
    governance.execute(owner, command("deactivate", 2, 1)),
    failsWith(409, "conflict"),
  );
  await assert.rejects(
    governance.execute(owner, command("reactivate", 1, 2)),
    failsWith(409, "invalid-transition"),
  );
  assert.deepEqual((await pg.query("SELECT status,version FROM enterprises")).rows, [
    { status: "active", version: 1 },
  ]);
  assert.equal((await pg.query("SELECT * FROM governance_command_receipts")).rows.length, 0);
});

test("lifecycle rejects other actors, cross-scope requests and revoked Owner epochs before replay", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await assert.rejects(
    governance.execute(outsider, command("deactivate", 1, 1)),
    failsWith(403, "forbidden"),
  );
  await assert.rejects(
    governance.execute(owner, { ...command("deactivate", 1, 2), enterpriseAccountId: "missing" }),
    failsWith(404, "not-found"),
  );
  await governance.execute(owner, command("deactivate", 1, 3));
  const reactivate = command("reactivate", 2, 4);
  await governance.execute(owner, reactivate);
  await pg.exec(
    "UPDATE users SET status='paused' WHERE id='owner'; UPDATE users SET status='active' WHERE id='owner'",
  );
  await assert.rejects(governance.execute(owner, reactivate), failsWith(403, "forbidden"));
  assert.equal((await pg.query("SELECT * FROM governance_command_receipts")).rows.length, 2);
});

test("receipt or audit failure rolls back lifecycle state and all durable evidence", async (t) => {
  const { pg, db } = await fixture();
  t.after(() => pg.close());
  for (const stage of ["governance_command_receipts", "governance_audit_events"]) {
    const failing: Database = {
      transaction: (work) =>
        db.transaction((sql) =>
          work(
            createSql(async (text, values) => {
              if (text.includes(`INSERT INTO ${stage}`))
                throw new Error("injected persistence failure");
              return sql.query(text, values);
            }),
          ),
        ),
    };
    const governance = createPostgresEnterpriseGovernance(failing, () => 100);
    await assert.rejects(
      governance.execute(owner, command("deactivate", 1, 1)),
      /injected persistence failure/,
    );
    assert.deepEqual((await pg.query("SELECT status,version FROM enterprises")).rows, [
      { status: "active", version: 1 },
    ]);
    assert.equal((await pg.query("SELECT * FROM governance_command_receipts")).rows.length, 0);
    assert.equal((await pg.query("SELECT * FROM governance_audit_events")).rows.length, 0);
  }
  const governance = createPostgresEnterpriseGovernance(db, () => 100);
  assert.equal((await governance.execute(owner, command("deactivate", 1, 1))).version, 2);
});
