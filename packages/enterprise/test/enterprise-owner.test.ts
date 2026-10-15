import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceAccessError } from "@line_bot_v1/identity-access/domain/role-assignment";
import { createSql, type Database } from "@line_bot_v1/platform/postgres";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPostgresEnterpriseGovernance } from "../src/composition/bootstrap/enterprise-governance.js";

const actor = { provider: "line:test", subject: "owner" };

function identityCommand(sequence: number) {
  return {
    action: "complete-enterprise-identity",
    enterpriseAccountId: "ent",
    name: " Recovered ",
    slug: " RECOVERED ",
    expectedVersion: 1,
    requestId: `55555555-5555-4555-8555-${String(sequence).padStart(12, "0")}`,
    reason: "identity recovery",
  };
}

function createCommand(sequence: number) {
  return {
    action: "create-enterprise",
    name: " Second Enterprise ",
    slug: " SECOND-ENTERPRISE ",
    requestId: `66666666-6666-4666-8666-${String(sequence).padStart(12, "0")}`,
    reason: "create enterprise",
  };
}

test("Enterprise creation atomically bootstraps the current actor and preserves replay, uniqueness and input failures", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const create = createCommand(1);
  const receipt = await governance.execute(actor, create);
  assert.equal(receipt.status, "active");
  assert.equal(receipt.version, 1);
  assert.equal(receipt.subjectKind, null);
  assert.deepEqual(await governance.execute(actor, create), receipt);
  assert.deepEqual(
    (
      await pg.query(
        "SELECT name,slug,status,version FROM app_private.enterprises WHERE account_id=$1",
        [receipt.scopeId],
      )
    ).rows,
    [{ name: "Second Enterprise", slug: "second-enterprise", status: "active", version: 1 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT user_id,status,version,user_status_version FROM app_private.enterprise_role_assignments WHERE enterprise_account_id=$1",
        [receipt.scopeId],
      )
    ).rows,
    [{ user_id: "owner", status: "active", version: 1, user_status_version: 1 }],
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT user_id,status,version FROM app_private.enterprise_direct_affiliations WHERE enterprise_account_id=$1",
        [receipt.scopeId],
      )
    ).rows,
    [{ user_id: "owner", status: "active", version: 1 }],
  );
  await assert.rejects(
    governance.execute(actor, { ...create, reason: "different" }),
    failsWith(409, "replay-conflict"),
  );
  await assert.rejects(governance.execute(actor, createCommand(2)), failsWith(409, "conflict"));
  for (const name of [" ", "x".repeat(121)])
    await assert.rejects(
      async () => governance.execute(actor, { ...createCommand(3), name }),
      (error: unknown) =>
        failsWith(400, "invalid-input")(error) &&
        error instanceof Error &&
        error.message === "Enterprise slug 或 name 不正確。",
    );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.accounts WHERE kind='ENTERPRISE'")).rows.length,
    2,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    1,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    1,
  );
  await pg.exec("UPDATE app_private.users SET status='paused' WHERE id='owner'");
  await assert.rejects(governance.execute(actor, create), failsWith(403, "forbidden"));
});

test("legacy Enterprise identity completion preserves current owner, stale-version, one-time and replay semantics", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await pg.exec(
    "UPDATE app_private.enterprises SET name=null,slug=null WHERE account_id='ent'; SELECT * FROM app_private.provision_enterprise_scope('other','owner','occupied','Occupied',2)",
  );
  const complete = identityCommand(1);
  await assert.rejects(
    governance.execute({ provider: "line:test", subject: "backup" }, complete),
    failsWith(403, "forbidden"),
  );
  await assert.rejects(
    governance.execute(actor, { ...complete, expectedVersion: 2 }),
    failsWith(409, "conflict"),
  );
  await assert.rejects(
    governance.execute(actor, { ...identityCommand(2), slug: "occupied" }),
    failsWith(409, "conflict"),
  );
  await assert.rejects(
    async () => governance.execute(actor, { ...identityCommand(3), name: " " }),
    (error: unknown) =>
      failsWith(400, "invalid-input")(error) &&
      error instanceof Error &&
      error.message === "Enterprise slug 或 name 不正確。",
  );
  const receipt = await governance.execute(actor, complete);
  assert.equal(receipt.version, 2);
  assert.deepEqual(await governance.execute(actor, complete), receipt);
  await assert.rejects(
    governance.execute(actor, { ...complete, reason: "changed" }),
    failsWith(409, "replay-conflict"),
  );
  await assert.rejects(
    governance.execute(actor, { ...identityCommand(4), expectedVersion: 2 }),
    failsWith(409, "invalid-transition"),
  );
  assert.deepEqual(
    (await pg.query("SELECT name,slug,version FROM app_private.enterprises WHERE account_id='ent'"))
      .rows,
    [{ name: "Recovered", slug: "recovered", version: 2 }],
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    1,
  );
  await pg.exec("UPDATE app_private.enterprises SET status='inactive' WHERE account_id='ent'");
  await assert.rejects(governance.execute(actor, complete), failsWith(403, "forbidden"));
});

test("Enterprise provisioning and identity completion roll back all state and evidence on audit failure", async (t) => {
  for (const mode of ["create", "complete"]) {
    const { pg, db } = await fixture();
    t.after(() => pg.close());
    if (mode === "complete")
      await pg.exec(
        "UPDATE app_private.enterprises SET name=null,slug=null WHERE account_id='ent'",
      );
    let transactions = 0;
    const failing: Database = {
      transaction(work) {
        transactions++;
        return db.transaction((sql) =>
          work(
            createSql((text, values) => {
              if (text.includes("INSERT INTO governance_audit_events"))
                throw new Error("audit failure");
              return sql.query(text, values);
            }),
          ),
        );
      },
    };
    const governance = createPostgresEnterpriseGovernance(failing, () => 100);
    await assert.rejects(
      governance.execute(actor, mode === "create" ? createCommand(1) : identityCommand(1)),
      /audit failure/,
    );
    assert.equal(transactions, 1);
    assert.equal(
      (await pg.query("SELECT * FROM app_private.accounts WHERE kind='ENTERPRISE'")).rows.length,
      1,
    );
    assert.equal(
      (await pg.query("SELECT * FROM app_private.enterprise_direct_affiliations")).rows.length,
      2,
    );
    assert.equal(
      (await pg.query("SELECT * FROM app_private.enterprise_role_assignments")).rows.length,
      1,
    );
    assert.deepEqual(
      (await pg.query("SELECT name,slug,version FROM app_private.enterprises")).rows,
      [
        {
          name: mode === "create" ? "Acme" : null,
          slug: mode === "create" ? "acme" : null,
          version: 1,
        },
      ],
    );
    assert.equal(
      (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
      0,
    );
    assert.equal(
      (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
      0,
    );
  }
});

function command(
  action: "grant-enterprise-owner" | "revoke-enterprise-owner",
  targetUserId: string,
  expectedVersion: number,
  sequence: number,
) {
  return {
    action,
    targetUserId,
    expectedVersion,
    enterpriseAccountId: "ent",
    requestId: `22222222-2222-4222-8222-${String(sequence).padStart(12, "0")}`,
    reason: "owner policy",
  };
}

function failsWith(status: number, code: string) {
  return (error: unknown) =>
    error instanceof GovernanceAccessError && error.status === status && error.code === code;
}

async function fixture() {
  const f = await postgresFixture();
  await f.pg.exec(`
    INSERT INTO app_private.users(id,status,status_version,"createdAt")
      VALUES ('owner','active',1,1),('backup','active',1,1),('outsider','active',1,1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id)
      VALUES ('line:test','owner','owner'),('line:test','backup','backup'),('line:test','outsider','outsider');
    SELECT * FROM app_private.provision_enterprise_scope('ent','owner','acme','Acme',2);
    INSERT INTO app_private.enterprise_direct_affiliations(enterprise_account_id,user_id,status,version,created_at)
      VALUES ('ent','backup','active',1,2);
  `);
  return { ...f, governance: createPostgresEnterpriseGovernance(f.db, () => 100) };
}

test("EnterpriseOwner mutation preserves current qualification, exact replay and epoch-bound last-owner protection", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const grant = command("grant-enterprise-owner", "backup", 0, 1);
  const granted = await governance.execute(actor, grant);
  assert.equal(granted.version, 1);
  assert.deepEqual(await governance.execute(actor, grant), granted);
  await assert.rejects(
    governance.execute(actor, { ...grant, reason: "changed" }),
    failsWith(409, "replay-conflict"),
  );
  await assert.rejects(
    governance.execute(actor, command("grant-enterprise-owner", "backup", 1, 2)),
    failsWith(409, "invalid-transition"),
  );
  await assert.rejects(
    governance.execute(actor, command("grant-enterprise-owner", "backup", 0, 3)),
    failsWith(409, "conflict"),
  );
  await assert.rejects(
    governance.execute(actor, command("grant-enterprise-owner", "outsider", 0, 4)),
    failsWith(403, "forbidden"),
  );
  await pg.exec(
    "UPDATE app_private.users SET status='paused' WHERE id='backup'; UPDATE app_private.users SET status='active' WHERE id='backup'",
  );
  await assert.rejects(
    governance.execute(actor, command("revoke-enterprise-owner", "owner", 1, 5)),
    failsWith(409, "last-effective-role-holder"),
  );
  assert.equal(
    (await governance.execute(actor, command("grant-enterprise-owner", "backup", 1, 6))).version,
    2,
  );
  const revoke = command("revoke-enterprise-owner", "backup", 2, 7);
  const revoked = await governance.execute(actor, revoke);
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.version, 3);
  assert.deepEqual(await governance.execute(actor, revoke), revoked);
  await assert.rejects(
    governance.execute({ provider: "line:test", subject: "backup" }, grant),
    failsWith(403, "forbidden"),
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    3,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    3,
  );
});

function affiliation(
  action:
    | "invite-user"
    | "accept-invitation"
    | "decline-invitation"
    | "cancel-invitation"
    | "remove-direct-affiliation"
    | "leave-enterprise",
  expectedVersion: number,
  sequence: number,
  targetUserId = "outsider",
) {
  return {
    action,
    expectedVersion,
    enterpriseAccountId: "ent",
    requestId: `44444444-4444-4444-8444-${String(sequence).padStart(12, "0")}`,
    reason: "affiliation policy",
    ...(action === "leave-enterprise" ? {} : { targetUserId }),
  };
}

test("Enterprise invitations grant no affiliation until self-acceptance and preserve versioned replay", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const outsider = { provider: "line:test", subject: "outsider" };
  const invite = affiliation("invite-user", 0, 1);
  const pending = await governance.execute(actor, invite);
  assert.equal(pending.status, "pending");
  assert.deepEqual(await governance.execute(actor, invite), pending);
  assert.equal(
    (
      await pg.query(
        "SELECT * FROM app_private.enterprise_user_affiliations WHERE user_id='outsider'",
      )
    ).rows.length,
    0,
  );
  const accept = affiliation("accept-invitation", 1, 2);
  await assert.rejects(governance.execute(actor, accept), failsWith(403, "forbidden"));
  const accepted = await governance.execute(outsider, accept);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.version, 2);
  assert.deepEqual(await governance.execute(outsider, accept), accepted);
  await assert.rejects(
    governance.execute(outsider, { ...accept, reason: "changed" }),
    failsWith(409, "replay-conflict"),
  );
  await assert.rejects(
    governance.execute(actor, affiliation("invite-user", 2, 3)),
    failsWith(409, "invalid-transition"),
  );
  const leave = affiliation("leave-enterprise", 1, 4);
  const removed = await governance.execute(outsider, leave);
  assert.equal(removed.status, "removed");
  assert.equal(removed.subjectKind, "user");
  assert.equal(removed.subjectId, "outsider");
  assert.deepEqual(await governance.execute(outsider, leave), removed);
  assert.equal(
    (
      await pg.query(
        "SELECT * FROM app_private.enterprise_user_affiliations WHERE user_id='outsider'",
      )
    ).rows.length,
    0,
  );
});

test("Enterprise invitation resolution preserves cancel, decline and reinvite without affiliation", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const outsider = { provider: "line:test", subject: "outsider" };
  await governance.execute(actor, affiliation("invite-user", 0, 1));
  await assert.rejects(
    governance.execute(actor, affiliation("invite-user", 1, 2)),
    failsWith(409, "conflict"),
  );
  await assert.rejects(
    governance.execute(outsider, affiliation("decline-invitation", 2, 3)),
    failsWith(409, "conflict"),
  );
  assert.equal(
    (await governance.execute(outsider, affiliation("decline-invitation", 1, 4))).version,
    2,
  );
  assert.equal((await governance.execute(actor, affiliation("invite-user", 2, 5))).version, 3);
  const cancel = affiliation("cancel-invitation", 3, 6);
  const cancelled = await governance.execute(actor, cancel);
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(await governance.execute(actor, cancel), cancelled);
  assert.equal((await governance.execute(actor, affiliation("invite-user", 4, 7))).version, 5);
  assert.equal(
    (
      await pg.query(
        "SELECT * FROM app_private.enterprise_user_affiliations WHERE user_id='outsider'",
      )
    ).rows.length,
    0,
  );
});

test("Enterprise direct removal protects current owners and leaves independent Organization affiliation intact", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  await assert.rejects(
    governance.execute(actor, affiliation("remove-direct-affiliation", 1, 1, "owner")),
    failsWith(409, "last-effective-role-holder"),
  );
  await pg.exec(`
    SELECT * FROM app_private.provision_organization_scope('org','backup','org','Org',2);
    INSERT INTO app_private.enterprise_organizations(enterprise_account_id,organization_account_id,status,version,attached_at) VALUES ('ent','org','active',1,2);
  `);
  await assert.rejects(
    governance.execute(
      { provider: "line:test", subject: "backup" },
      affiliation("leave-enterprise", 1, 2),
    ),
    failsWith(409, "scope-conflict"),
  );
  await governance.execute(actor, affiliation("remove-direct-affiliation", 1, 3, "backup"));
  assert.deepEqual(
    (
      await pg.query(
        "SELECT source_kind FROM app_private.enterprise_user_affiliations WHERE user_id='backup'",
      )
    ).rows,
    [{ source_kind: "organization" }],
  );
  await pg.exec(
    "UPDATE app_private.enterprise_direct_affiliations SET status='active',version=3 WHERE user_id='backup'",
  );
  await governance.execute(actor, command("grant-enterprise-owner", "backup", 0, 1));
  const leave = affiliation("leave-enterprise", 1, 4);
  const removed = await governance.execute(actor, leave);
  assert.deepEqual(await governance.execute(actor, leave), removed);
  assert.deepEqual(
    (
      await pg.query(
        "SELECT status,version FROM app_private.enterprise_role_assignments WHERE user_id='owner'",
      )
    ).rows,
    [{ status: "revoked", version: 2 }],
  );
  await assert.rejects(
    governance.execute(actor, affiliation("remove-direct-affiliation", 3, 5, "backup")),
    failsWith(403, "forbidden"),
  );
});

test("Enterprise acceptance rolls back invitation, direct affiliation and evidence on recording failure", async (t) => {
  for (const stage of ["governance_command_receipts", "governance_audit_events"]) {
    const { pg, db, governance } = await fixture();
    t.after(() => pg.close());
    await governance.execute(actor, affiliation("invite-user", 0, 1));
    let transactions = 0;
    const failing: Database = {
      transaction(work) {
        transactions++;
        return db.transaction((sql) =>
          work(
            createSql((text, values) => {
              if (text.includes(`INSERT INTO ${stage}`)) throw new Error("recording failure");
              return sql.query(text, values);
            }),
          ),
        );
      },
    };
    const failingGovernance = createPostgresEnterpriseGovernance(failing, () => 100);
    await assert.rejects(
      failingGovernance.execute(
        { provider: "line:test", subject: "outsider" },
        affiliation("accept-invitation", 1, 2),
      ),
      /recording failure/,
    );
    assert.equal(transactions, 1);
    assert.deepEqual(
      (await pg.query("SELECT status,version FROM app_private.enterprise_invitations")).rows,
      [{ status: "pending", version: 1 }],
    );
    assert.equal(
      (
        await pg.query(
          "SELECT * FROM app_private.enterprise_direct_affiliations WHERE user_id='outsider'",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
      1,
    );
    assert.equal(
      (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
      1,
    );
  }
});

test("EnterpriseOwner exact replay still requires current owner authority and target checks remain after replay", async (t) => {
  const { pg, governance } = await fixture();
  t.after(() => pg.close());
  const grant = command("grant-enterprise-owner", "backup", 0, 1);
  const receipt = await governance.execute(actor, grant);
  await pg.exec("UPDATE app_private.users SET status='paused',status_version=2 WHERE id='backup'");
  assert.deepEqual(await governance.execute(actor, grant), receipt);
  await assert.rejects(
    governance.execute(actor, command("revoke-enterprise-owner", "backup", 1, 2)),
    failsWith(404, "not-found"),
  );
  await pg.exec(
    "UPDATE app_private.enterprise_role_assignments SET status='revoked' WHERE user_id='owner'",
  );
  await assert.rejects(governance.execute(actor, grant), failsWith(403, "forbidden"));
});

test("EnterpriseOwner audit failure rolls back role and receipt in the same physical transaction", async (t) => {
  const { pg, db } = await fixture();
  t.after(() => pg.close());
  let transactions = 0;
  const failing: Database = {
    transaction(work) {
      transactions++;
      return db.transaction((sql) =>
        work(
          createSql((text, values) => {
            if (text.includes("INSERT INTO governance_audit_events"))
              throw new Error("audit failure");
            return sql.query(text, values);
          }),
        ),
      );
    },
  };
  const governance = createPostgresEnterpriseGovernance(failing, () => 100);
  await assert.rejects(
    governance.execute(actor, command("grant-enterprise-owner", "backup", 0, 1)),
    /audit failure/,
  );
  assert.equal(transactions, 1);
  assert.equal(
    (await pg.query("SELECT * FROM app_private.enterprise_role_assignments WHERE user_id='backup'"))
      .rows.length,
    0,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_command_receipts")).rows.length,
    0,
  );
  assert.equal(
    (await pg.query("SELECT * FROM app_private.governance_audit_events")).rows.length,
    0,
  );
});
