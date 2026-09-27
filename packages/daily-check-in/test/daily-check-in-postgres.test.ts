import assert from "node:assert/strict";
import { test } from "node:test";
import { UserError } from "@line-work/account/domain/user";
import { COIN_ASSET_CODE } from "@line-work/asset/domain";
import { recordLedgerCredit } from "@line-work/ledger/adapters/postgres";
import type { Database, Sql } from "@line-work/platform/adapters/postgres";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresDailyCheckInStore } from "../src/adapters/postgres.js";
import { createDailyCheckIn } from "../src/application.js";
import { DAILY_CHECK_IN_LEDGER_SOURCE, DailyCheckInError } from "../src/domain.js";

test("Postgres DailyCheckIn persists one wheel outcome and replays across Taipei midnight", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const memberId = "daily-user";
  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    memberId,
    "active",
    1,
  ]);
  let draws = 0;
  const store = new PostgresDailyCheckInStore(db, () => {
    draws++;
    return draws === 1 ? 90 : 0;
  });
  const now = Date.parse("2026-09-24T15:59:59Z");

  const first = await store.claim(memberId, now, "2026-09-24");
  assert.deepEqual(first, {
    claim: {
      day: "2026-09-24",
      prizeCode: "coin-four",
      reward: 4,
      policyVersion: "wheel-v1",
      decidedAt: now,
    },
    credited: 4,
    replayed: false,
  });
  const replay = await store.claim(memberId, Date.parse("2026-09-24T16:00:01Z"), "2026-09-24");
  assert.deepEqual(replay, { claim: first.claim, credited: 0, replayed: true });
  assert.deepEqual(await store.read(memberId, "2026-09-24", "active"), first.claim);
  assert.equal(draws, 1, "replay and recovery never draw another outcome");

  const ledger = await pg.query(
    "select amount_units,business_day from app_private.asset_ledger_entries where member_id=$1",
    [memberId],
  );
  assert.deepEqual(ledger.rows, [{ amount_units: 8, business_day: "2026-09-24" }]);
  const nextDay = await store.claim(memberId, Date.parse("2026-09-24T16:00:01Z"), "2026-09-25");
  assert.equal(nextDay.claim.reward, 0.5);
  assert.equal(nextDay.replayed, false);
  assert.equal(draws, 2);
});

test("Postgres DailyCheckIn refuses stale unclaimed days and orphan Ledger facts", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  for (const memberId of ["stale-user", "orphan-ledger-user"]) {
    await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
      memberId,
      "active",
      1,
    ]);
  }
  const store = new PostgresDailyCheckInStore(db, () => 0);
  await assert.rejects(
    store.claim("stale-user", Date.parse("2026-09-24T16:00:01Z"), "2026-09-24"),
    (error) => error instanceof DailyCheckInError && error.status === 409,
  );
  await db.transaction((sql) =>
    recordLedgerCredit(sql, {
      holderAccountId: "orphan-ledger-user",
      asset: COIN_ASSET_CODE,
      source: DAILY_CHECK_IN_LEDGER_SOURCE,
      sourceRef: "2026-09-24",
      businessDay: "2026-09-24",
      amount: 1,
      at: Date.parse("2026-09-24T15:00:00Z"),
    }),
  );
  await assert.rejects(
    store.claim("orphan-ledger-user", Date.parse("2026-09-24T15:59:59Z"), "2026-09-24"),
    (error) => error instanceof DailyCheckInError && error.status === 409,
  );
});

test("Postgres DailyCheckIn rolls back claim outcome when Ledger posting fails", async (t) => {
  const { pg } = await postgresFixture();
  t.after(() => pg.close());
  const memberId = "rollback-user";
  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    memberId,
    "active",
    1,
  ]);
  const failingDb: Database = {
    transaction: (work) =>
      pg.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE line_app; SET LOCAL search_path=app_private,pg_catalog;");
        const guarded: Sql = {
          query: (text, values) => {
            if (String(text).includes("post_asset_credit")) throw new Error("ledger unavailable");
            return tx.query(text, values);
          },
        };
        return work(guarded);
      }),
  };
  const store = new PostgresDailyCheckInStore(failingDb, () => 0);
  await assert.rejects(
    store.claim(memberId, Date.parse("2026-09-24T15:59:59Z"), "2026-09-24"),
    /ledger unavailable/,
  );
  const rows = await pg.query("select 1 from app_private.daily_check_in_claims where user_id=$1", [
    memberId,
  ]);
  assert.equal(rows.rows.length, 0);
});

test("Postgres rejects a committed DailyCheckIn claim without matching Ledger fact", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const memberId = "direct-claim-user";
  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    memberId,
    "active",
    1,
  ]);

  await assert.rejects(
    db.transaction((sql) =>
      sql.query(
        `insert into daily_check_in_claims(
           user_id,business_day,prize_code,reward_asset_code,reward_amount_units,policy_version,decided_at
         ) values($1,$2,'coin-one','coin',2,'wheel-v1',$3)`,
        [memberId, "2026-09-24", Date.parse("2026-09-24T15:59:59Z")],
      ),
    ),
    /daily_check_in_claim_ledger_mismatch/,
  );
});

test("DailyCheckIn qualification is rechecked in the transaction and claims are immutable", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  const memberId = "qualification-user";
  await pg.query('insert into app_private.users(id,status,"createdAt") values($1,$2,$3)', [
    memberId,
    "active",
    1,
  ]);
  const store = new PostgresDailyCheckInStore(db, () => 60);
  const app = createDailyCheckIn({
    activeUser: async () => {
      // Simulate revocation committing after identity resolution but before the result transaction.
      await pg.query(
        "update app_private.users set status='paused', status_version=status_version+1 where id=$1",
        [memberId],
      );
      return { id: memberId };
    },
    member: async () => {
      throw new Error("unexpected member projection");
    },
    repository: () => store,
    coinBalance: async () => 0,
    now: () => Date.parse("2026-09-24T15:59:59Z"),
  });
  await assert.rejects(
    app.readClaim("verified-subject", "2026-09-24"),
    (error) => error instanceof UserError && error.status === 403,
  );
  await assert.rejects(store.claim(memberId, Date.parse("2026-09-24T15:59:59Z"), "2026-09-24"));
  await assert.rejects(store.read(memberId, "2026-09-24", "active"));
  assert.equal(await store.read(memberId, "2026-09-24", "any"), null);
  assert.equal(
    (await pg.query("select 1 from app_private.daily_check_in_claims where user_id=$1", [memberId]))
      .rows.length,
    0,
  );
  const privileges = await pg.query(`select
    has_table_privilege('line_app','app_private.daily_check_in_claims','UPDATE') as can_update,
    has_table_privilege('line_app','app_private.daily_check_in_claims','DELETE') as can_delete,
    has_table_privilege('anon','app_private.daily_check_in_claims','SELECT') as anonymous_read,
    has_table_privilege('authenticated','app_private.daily_check_in_claims','SELECT') as browser_read`);
  assert.deepEqual(privileges.rows, [
    { can_update: false, can_delete: false, anonymous_read: false, browser_read: false },
  ]);
});
