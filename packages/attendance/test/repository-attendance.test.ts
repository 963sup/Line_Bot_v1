import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import {
  nullableString,
  numericValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import { PostgresAttendanceStore } from "../src/adapters/outbound/persistence/postgres-attendance-store.js";

const now = Date.parse("2026-09-28T08:00:00+08:00");
const address = { address: "Test address", latitude: 25, longitude: 121, radius: 100 };
const input = (expectedVersion: number) => ({
  requestId: randomUUID(),
  expectedVersion,
  location: { latitude: 25, longitude: 121, accuracy: 5 },
});

function attendanceSnapshotRow(value: unknown) {
  const row = record(value);
  const point = record(row.point_snapshot);
  return {
    repositoryId: stringValue(row.repository_id),
    address: nullableString(point.address),
  };
}

function pointSnapshotAddress(value: unknown) {
  return nullableString(record(record(value).point_snapshot).address);
}

async function fixture() {
  const fixture = await postgresFixture();
  await fixture.pg.exec(`
    BEGIN;
    INSERT INTO app_private.users(id,status,"createdAt") VALUES('owner','active',1),('member','active',1),('outsider','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1) FROM app_private.users;
    INSERT INTO app_private.user_identities(provider,subject,user_id) VALUES('line:test','U11111111111111111111111111111111','member'),('line:test','U22222222222222222222222222222222','outsider');
    INSERT INTO app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version)
    VALUES('repo','owner','USER','test','public',1);
    SELECT app_private.claim_scoped_namespace_name(
      'repository-name','OWNER_ACCOUNT','owner','REPOSITORY','repo','test',1
    );
    INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version)
    VALUES('repo','owner','admin',1),('repo','member','read',1);
    COMMIT;
  `);
  await fixture.pg.query("UPDATE app_private.repositories SET address=$1 WHERE id='repo'", [
    JSON.stringify(address),
  ]);
  return { ...fixture, store: new PostgresAttendanceStore(fixture.db) };
}

test("Repository member can clock; public visibility does not grant attendance; address and member removal preserve clock-out", async (t) => {
  const { pg, store } = await fixture();
  t.after(() => pg.close());
  const recipient = { provider: "line:test", subject: "U11111111111111111111111111111111" };
  assert.equal((await store.prepare("outsider", now)).sites.length, 0);
  await assert.rejects(
    store.execute("outsider", "clockIn", input(0), now, {
      provider: "line:test",
      subject: "U22222222222222222222222222222222",
    }),
    /儲存庫/,
  );
  const start = input(0);
  const started = await store.execute("member", "clockIn", start, now, recipient);
  assert.equal(started.attendance.records.length, 1);
  assert.equal(started.sites[0]?.repositoryId, "repo");
  await pg.exec(
    "DELETE FROM app_private.repository_access WHERE principal_id='member'; UPDATE app_private.repositories SET address=NULL WHERE id='repo';",
  );
  const prepared = await store.prepare("member", now + 1000);
  assert.equal(prepared.working, true);
  assert.equal(prepared.sites[0]?.address, address.address);
  assert.equal(
    (await store.execute("member", "clockIn", start, now + 1000, recipient)).replayed,
    true,
  );
  const end = input(1);
  const ended = await store.execute("member", "clockOut", end, now + 3600000, recipient);
  assert.equal(ended.attendance.active, null);
  assert.equal(ended.sites.length, 0);
  assert.equal(ended.attendance.records[0]?.endedAt, now + 3600000);
  assert.equal(
    (await store.execute("member", "clockOut", end, now + 3600100, recipient)).credited,
    0,
  );
  await assert.rejects(
    store.execute("member", "clockIn", input(2), now + 3600200, recipient),
    /儲存庫/,
  );
  const snapshotValue = (
    await pg.query("SELECT repository_id,point_snapshot FROM app_private.attendance_sessions")
  ).rows[0];
  const snapshot = snapshotValue ? attendanceSnapshotRow(snapshotValue) : undefined;
  assert.ok(snapshot);
  assert.equal(snapshot.repositoryId, "repo");
  assert.equal(snapshot.address, address.address);
});

test("coordinates and radius authorize attendance when the Repository description is null", async (t) => {
  const { pg, store } = await fixture();
  t.after(() => pg.close());
  await pg.query("UPDATE app_private.repositories SET address=$1 WHERE id='repo'", [
    JSON.stringify({ ...address, address: null }),
  ]);
  const recipient = { provider: "line:test", subject: "U11111111111111111111111111111111" };

  const prepared = await store.prepare("member", now);
  assert.equal(prepared.sites[0]?.address, null);
  await assert.rejects(
    store.execute(
      "member",
      "clockIn",
      {
        ...input(0),
        location: { latitude: 25.01, longitude: 121, accuracy: 5 },
      },
      now,
      recipient,
    ),
    /範圍/,
  );

  const started = await store.execute("member", "clockIn", input(0), now, recipient);
  assert.equal(started.sites[0]?.address, null);
  const persisted = await pg.query(
    "SELECT point_snapshot FROM app_private.attendance_sessions WHERE uid='member'",
  );
  assert.equal(pointSnapshotAddress(persisted.rows[0]), null);

  await pg.query("UPDATE app_private.repositories SET address=$1 WHERE id='repo'", [
    JSON.stringify({ ...address, address: "後續新增的地址描述" }),
  ]);
  const active = await store.prepare("member", now + 1_000);
  assert.equal(active.sites[0]?.address, null);
  const ended = await store.execute("member", "clockOut", input(1), now + 3_600_000, recipient);
  assert.equal(ended.attendance.active, null);
  const unchanged = await pg.query(
    "SELECT point_snapshot FROM app_private.attendance_sessions WHERE uid='member'",
  );
  assert.equal(pointSnapshotAddress(unchanged.rows[0]), null);
});

test("clock-out checks original geofence, replay fingerprint and state version", async (t) => {
  const { pg, store } = await fixture();
  t.after(() => pg.close());
  const recipient = { provider: "line:test", subject: "U11111111111111111111111111111111" };
  await store.execute("member", "clockIn", input(0), now, recipient);
  await pg.query("UPDATE app_private.repositories SET address=$1 WHERE id='repo'", [
    JSON.stringify({ ...address, latitude: 26 }),
  ]);
  await assert.rejects(
    store.execute(
      "member",
      "clockOut",
      { ...input(1), location: { latitude: 26, longitude: 121, accuracy: 5 } },
      now + 1000,
      recipient,
    ),
    /範圍/,
  );
  await assert.rejects(
    store.execute("member", "clockOut", input(0), now + 1000, recipient),
    /狀態已變更/,
  );
  const end = input(1);
  await store.execute("member", "clockOut", end, now + 1000, recipient);
  await assert.rejects(
    store.execute("member", "clockOut", { ...end, expectedVersion: 2 }, now + 2000, recipient),
    /不同操作/,
  );
  await assert.rejects(pg.query("UPDATE app_private.attendance_sessions SET point_snapshot='{}'"));
});

test("pre-cutover open session closes using its existing clock-in evidence without inventing repository membership", async (t) => {
  const { pg, store } = await fixture();
  t.after(() => pg.close());
  const record = randomUUID();
  await pg.query(
    "INSERT INTO app_private.attendance_sessions(id,uid,day,started_at,rule_version) VALUES($1,'member','2026-09-28',$2,'taipei-window-v1')",
    [record, now],
  );
  await pg.query(
    "INSERT INTO app_private.attendance_events(uid,command,at,recorded_at,details) VALUES('member','clockIn',$1,$1,$2)",
    [
      now,
      JSON.stringify({
        recordId: record,
        site: {
          id: randomUUID(),
          name: "Old point",
          description: "Old address",
          latitude: 25,
          longitude: 121,
          radius: 100,
          version: 1,
        },
      }),
    ],
  );
  await pg.exec("DELETE FROM app_private.repository_access WHERE principal_id='member'");
  assert.equal((await store.prepare("member", now + 1000)).sites[0]?.repositoryId, null);
  const original = input(0);
  const originalFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        action: "clockIn",
        version: 0,
        location: original.location,
      }),
    )
    .digest("hex");
  const snapshot = await store.snapshot("member", now + 1000);
  const originalSite = snapshot.sites[0];
  assert.ok(originalSite);
  const { address: oldAddress, repositoryId: _repositoryId, ...oldPoint } = originalSite;
  await pg.query(
    "INSERT INTO app_private.attendance_commands(uid,request_id,fingerprint,result,at) VALUES('member',$1,$2,$3,$4)",
    [
      original.requestId,
      originalFingerprint,
      JSON.stringify({
        ...snapshot,
        sites: [{ ...oldPoint, description: oldAddress }],
        credited: 0.5,
        replayed: false,
      }),
      now,
    ],
  );
  const replay = await store.execute("member", "clockIn", original, now + 1000, {
    provider: "line:test",
    subject: "U11111111111111111111111111111111",
  });
  assert.equal(replay.sites[0]?.repositoryId, null);
  assert.equal(replay.sites[0]?.address, "Old address");
  assert.equal(replay.credited, 0);
  assert.equal(replay.replayed, true);
  assert.deepEqual(
    (await pg.query("SELECT count(*)::int AS n FROM app_private.attendance_events")).rows,
    [{ n: 1 }],
  );
  const ended = await store.execute("member", "clockOut", input(0), now + 1000, {
    provider: "line:test",
    subject: "U11111111111111111111111111111111",
  });
  assert.equal(ended.attendance.active, null);
  const rows = (
    await pg.query("SELECT repository_id,point_snapshot FROM app_private.attendance_sessions")
  ).rows;
  assert.deepEqual(rows, [{ repository_id: null, point_snapshot: null }]);
});

test("review receipt replays after repository ADMIN access is revoked", async (t) => {
  const { pg, store } = await fixture();
  t.after(() => pg.close());
  const member = { provider: "line:test", subject: "U11111111111111111111111111111111" };
  const reviewer = { provider: "line:test", subject: "U22222222222222222222222222222222" };
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('repo','outsider','admin',1)",
  );
  const submitted = await store.submit(
    "member",
    {
      requestId: randomUUID(),
      kind: "new-session",
      repositoryId: "repo",
      startedAt: now - 7200000,
      endedAt: now - 3600000,
      reason: "補登測試",
    },
    now,
    member,
  );
  const command = {
    commandId: randomUUID(),
    supplementId: submitted.supplement.id,
    expectedVersion: 0,
    decision: "reject" as const,
    reason: "資料待確認",
  };
  const first = await store.review("outsider", command, now, reviewer);
  await pg.query(
    "UPDATE app_private.repository_access SET capability='read' WHERE repository_id='repo' AND principal_id='outsider'",
  );
  assert.deepEqual(await store.review("outsider", command, now + 1, reviewer), { replayed: true });
  await assert.rejects(
    () => store.review("outsider", { ...command, commandId: randomUUID() }, now + 1, reviewer),
    { status: 403 },
  );
  await assert.rejects(() => store.review("member", command, now + 1, member), { status: 403 });
  await pg.query("SELECT * FROM app_private.provision_repository($1,$2,$2,'USER',$3,'private')", [
    "other-repo",
    "member",
    "Other",
  ]);
  await pg.query("UPDATE app_private.repositories SET address=$1 WHERE id='other-repo'", [
    JSON.stringify(address),
  ]);
  const otherSubmitted = await store.submit(
    "member",
    {
      requestId: randomUUID(),
      kind: "new-session",
      repositoryId: "other-repo",
      startedAt: now - 7200000,
      endedAt: now - 3600000,
      reason: "其他範圍補登",
    },
    now,
    member,
  );
  await assert.rejects(
    () =>
      store.review(
        "outsider",
        { ...command, supplementId: otherSubmitted.supplement.id },
        now + 1,
        reviewer,
      ),
    { status: 409 },
  );
  assert.deepEqual(
    (
      await pg.query(
        "SELECT count(*)::int AS count FROM app_private.attendance_events WHERE command='supplement-rejected'",
      )
    ).rows,
    [{ count: 1 }],
  );
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='repo' AND principal_id='outsider'",
  );

  const replay = await store.review("outsider", command, now + 1, reviewer);

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(first, { replayed: false });
  assert.deepEqual(replay, { replayed: true });
  await pg.query("UPDATE app_private.repositories SET visibility='private' WHERE id='repo'");
  assert.deepEqual(await store.review("outsider", command, now + 2, reviewer), { replayed: true });
  await assert.rejects(
    () => store.review("outsider", { ...command, commandId: randomUUID() }, now + 3, reviewer),
    { status: 403 },
  );
  await assert.rejects(
    () => store.review("outsider", { ...command, reason: "changed" }, now + 3, reviewer),
    { status: 409 },
  );
  await assert.rejects(() => store.review("outsider", command, now + 3, member), { status: 403 });
  await assert.rejects(
    () => store.review("outsider", { ...command, supplementId: randomUUID() }, now + 3, reviewer),
    { status: 409 },
  );
  await pg.query("UPDATE app_private.users SET status='paused' WHERE id='outsider'");
  await assert.rejects(() => store.review("outsider", command, now + 3, reviewer), { status: 403 });
  await pg.query("UPDATE app_private.users SET status='active' WHERE id='outsider'");
  await pg.query(
    "UPDATE app_private.attendance_commands SET result='{}'::jsonb WHERE uid='outsider' AND request_id=$1",
    [command.commandId],
  );
  await assert.rejects(() => store.review("outsider", command, now + 4, reviewer), { status: 502 });
});

test("review inbox shows all pending requests and repository submissions enforce a concurrent limit", async (t) => {
  const { pg, store } = await fixture();
  t.after(() => pg.close());
  const reviewer = { provider: "line:test", subject: "U22222222222222222222222222222222" };
  const member = { provider: "line:test", subject: "U11111111111111111111111111111111" };
  await pg.exec(`
    BEGIN;
    INSERT INTO app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version)
    VALUES('repo-2','owner','USER','test-2','public',1);
    SELECT app_private.claim_scoped_namespace_name(
      'repository-name','OWNER_ACCOUNT','owner','REPOSITORY','repo-2','test-2',1
    );
    INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version)
    VALUES('repo','outsider','admin',1),('repo-2','outsider','admin',1),('repo-2','member','read',1);
    COMMIT;
  `);
  await pg.query("UPDATE app_private.repositories SET address=$1 WHERE id='repo-2'", [
    JSON.stringify(address),
  ]);
  await pg.query(
    `INSERT INTO app_private.attendance_supplement_requests(
       id,uid,repository_id,kind,started_at,ended_at,site_snapshot,reason,submitted_at
     )
     SELECT gen_random_uuid(),'member',repository_id,'new-session',
       $1::bigint-(sequence::bigint*7200000)-3600000,$1::bigint-(sequence::bigint*7200000),
       jsonb_build_object('id',repository_id,'repositoryId',repository_id,'name',repository_id,
         'address','Test address','latitude',25,'longitude',121,'radius',100,'version',1),
       'queue seed',$1
     FROM unnest(ARRAY['repo','repo-2']::text[]) AS repositories(repository_id)
     CROSS JOIN generate_series(1,60) AS series(sequence)`,
    [now],
  );

  const initialInbox = await store.list("outsider", now, reviewer);
  assert.equal(initialInbox.review.length, 120);

  await pg.query(
    `INSERT INTO app_private.attendance_supplement_requests(
       id,uid,repository_id,kind,started_at,ended_at,site_snapshot,reason,submitted_at
     )
     SELECT gen_random_uuid(),'member','repo','new-session',
       $1::bigint-(sequence::bigint*1000)-100,$1::bigint-(sequence::bigint*1000),
       jsonb_build_object('id','repo','repositoryId','repo','name','repo',
         'address','Test address','latitude',25,'longitude',121,'radius',100,'version',1),
       'queue seed',$1
     FROM generate_series(1,39) AS series(sequence)`,
    [now],
  );
  const firstSubmission = {
    kind: "new-session" as const,
    repositoryId: "repo",
    startedAt: now - 900000,
    endedAt: now - 899000,
    reason: "並行申請一",
  };
  const secondSubmission = {
    ...firstSubmission,
    startedAt: now - 898000,
    endedAt: now - 897000,
    reason: "並行申請二",
  };
  const results = await Promise.allSettled([
    store.submit("member", { requestId: randomUUID(), ...firstSubmission }, now, member),
    store.submit("outsider", { requestId: randomUUID(), ...secondSubmission }, now, reviewer),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.match(String(rejected.reason), /待審補登已達上限/);
  assert.deepEqual(
    (
      await pg.query(
        "SELECT count(*)::int AS count FROM app_private.attendance_supplement_requests WHERE repository_id='repo' AND status='PENDING'",
      )
    ).rows,
    [{ count: 100 }],
  );

  const fullInbox = await store.list("outsider", now, reviewer);
  const visibleCount = await pg.query(
    "SELECT count(*) AS count FROM app_private.attendance_supplement_requests WHERE repository_id=ANY(ARRAY['repo','repo-2']::text[]) AND status='PENDING' AND uid<>'outsider'",
  );
  const expectedVisible = Number(numericValue(record(visibleCount.rows[0]).count));
  assert.equal(fullInbox.review.length, expectedVisible);
  assert.ok(fullInbox.review.length > 100);
});

test("applicant inbox keeps every pending request visible beyond the recent-history limit", async (t) => {
  const { pg, store } = await fixture();
  t.after(() => pg.close());
  const member = { provider: "line:test", subject: "U11111111111111111111111111111111" };
  await pg.exec(`
    BEGIN;
    INSERT INTO app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version)
    VALUES('repo-2','owner','USER','test-2','public',1);
    SELECT app_private.claim_scoped_namespace_name(
      'repository-name','OWNER_ACCOUNT','owner','REPOSITORY','repo-2','test-2',1
    );
    COMMIT;
  `);
  await pg.query(
    `INSERT INTO app_private.attendance_supplement_requests(
       id,uid,repository_id,kind,started_at,ended_at,site_snapshot,reason,submitted_at
     )
     SELECT gen_random_uuid(),'member',repository_id,'new-session',
       $1::bigint-(sequence::bigint*7200000)-3600000,$1::bigint-(sequence::bigint*7200000),
       jsonb_build_object('id',repository_id,'repositoryId',repository_id,'name',repository_id,
         'address','Test address','latitude',25,'longitude',121,'radius',100,'version',1),
       'pending applicant request',$1
     FROM unnest(ARRAY['repo','repo-2']::text[]) AS repositories(repository_id)
     CROSS JOIN generate_series(1,60) AS series(sequence)`,
    [now],
  );

  const inbox = await store.list("member", now, member);

  assert.equal(inbox.mine.length, 120);
  assert.ok(inbox.mine.every((request) => request.status === "PENDING"));
});

test("OrganizationOwner can review an Organization-owned supplement without a direct Repository grant", async (t) => {
  const { pg, store } = await fixture();
  t.after(() => pg.close());

  await pg.exec(`
    INSERT INTO app_private.users(id,status,"createdAt")
    VALUES('org-owner','active',1),('org-worker','active',1);
    SELECT app_private.claim_account_login(id,'USER',id,1)
    FROM app_private.users
    WHERE id IN ('org-owner','org-worker');
    INSERT INTO app_private.user_identities(provider,subject,user_id)
    VALUES
      ('line:test','U33333333333333333333333333333333','org-worker'),
      ('line:test','U44444444444444444444444444444444','org-owner');
  `);
  await pg.query("select * from app_private.provision_organization_scope($1,$2,$3,$4,$5)", [
    "org-scope",
    "org-owner",
    "org-login",
    "Org Scope",
    2,
  ]);
  await pg.query("select * from app_private.provision_repository($1,$2,$3,'ORGANIZATION',$4,$5)", [
    "org-repo",
    "org-owner",
    "org-scope",
    "Org Repo",
    "private",
  ]);
  await pg.query(
    "DELETE FROM app_private.repository_access WHERE repository_id='org-repo' AND principal_id='org-owner'",
  );
  await pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES('org-repo','org-worker','read',1)",
  );
  await pg.query("UPDATE app_private.repositories SET address=$1 WHERE id='org-repo'", [
    JSON.stringify(address),
  ]);

  const workerRecipient = {
    provider: "line:test",
    subject: "U33333333333333333333333333333333",
  };
  const ownerRecipient = {
    provider: "line:test",
    subject: "U44444444444444444444444444444444",
  };
  const submitted = await store.submit(
    "org-worker",
    {
      requestId: randomUUID(),
      kind: "new-session",
      repositoryId: "org-repo",
      startedAt: now - 7200000,
      endedAt: now - 3600000,
      reason: "Organization Repository 補登測試",
    },
    now,
    workerRecipient,
  );

  const inbox = await store.list("org-owner", now, ownerRecipient);
  assert.equal(inbox.review.length, 1);
  const review = await store.review(
    "org-owner",
    {
      commandId: randomUUID(),
      supplementId: submitted.supplement.id,
      expectedVersion: submitted.supplement.version,
      decision: "approve",
    },
    now,
    ownerRecipient,
  );
  assert.deepEqual(review, { replayed: false });
  assert.deepEqual(
    (
      await pg.query("SELECT status FROM app_private.attendance_supplement_requests WHERE id=$1", [
        submitted.supplement.id,
      ])
    ).rows,
    [{ status: "APPROVED" }],
  );
});
