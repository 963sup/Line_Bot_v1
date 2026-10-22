import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { PostgresUserStore } from "@line_bot_v1/account/postgres";
import { supabaseIdentity } from "@line_bot_v1/account/supabase-identity";
import { createPostgresAttendanceStore } from "@line_bot_v1/attendance/composition/bootstrap/postgres-attendance-store";
import { createPostgresDailyCheckInStore } from "@line_bot_v1/daily-check-in/composition/bootstrap/postgres-daily-check-in-store";
import { createPostgresExpenseStore } from "@line_bot_v1/expense/composition/bootstrap/postgres-expense-store";
import { protectPermissionAdministrator } from "@line_bot_v1/identity-access/postgres";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line/provider";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresWalletStore } from "@line_bot_v1/wallet/postgres";
import { idempotencyFixture } from "./idempotency-fixture";

let fixture: Awaited<ReturnType<typeof postgresFixture>>;
const identities = new Map<string, { id: string; sub: string; email: string }>();
export function identityFor(user: string) {
  let value = identities.get(user);
  if (!value) {
    value = { id: randomUUID(), sub: `google-${user}`, email: `${user}@example.test` };
    identities.set(user, value);
  }
  return value;
}
export async function mockSupabase() {
  globalThis.lineIdempotency = idempotencyFixture();
  fixture = await postgresFixture();
  globalThis.userStore = new PostgresUserStore(fixture.db, {
    protectPermissionAdministrator,
  });
  globalThis.dailyCheckInStore = createPostgresDailyCheckInStore(fixture.db);
  globalThis.walletStore = new PostgresWalletStore(fixture.db);
  globalThis.attendanceStore = createPostgresAttendanceStore(fixture.db);
  globalThis.expenseStore = createPostgresExpenseStore(fixture.db);
  mock.method(supabaseIdentity(), "verify", async (token: string) => {
    const response = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { userId } = await response.json();
    return identityFor(userId);
  });
}
function requireFixtureValue<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`${name} fixture is not initialized`);
  return value;
}
export function memberStore() {
  return requireFixtureValue(globalThis.userStore, "User store");
}
export function walletStore() {
  return requireFixtureValue(globalThis.walletStore, "Wallet store");
}
export function expenseStore() {
  return requireFixtureValue(globalThis.expenseStore, "Expense store");
}
export async function prepareGoogle(user: string) {
  const identity = identityFor(user);
  await fixture.pg.query("INSERT INTO auth.users(id) VALUES($1) ON CONFLICT DO NOTHING", [
    identity.id,
  ]);
  return identity;
}
export async function activateMember(user: string) {
  const login = `test-${user.slice(1, 9).toLowerCase()}`;
  return (await memberStore().registerLine(LINE_PROVIDER_NAMESPACE, user, login)).id;
}

export async function closeFixture() {
  await fixture.pg.close();
}

export async function allowAttendance(userId: string) {
  const id = randomUUID();
  await fixture.pg.query(
    `WITH inserted AS (
       INSERT INTO app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version,address)
       VALUES($1,$2,'USER',$1,'private',1,$3) RETURNING id,owner_account_id,name
     ) SELECT app_private.claim_scoped_namespace_name(
       'repository-name','OWNER_ACCOUNT',owner_account_id,'REPOSITORY',id,name,0
     ) FROM inserted`,
    [
      id,
      userId,
      JSON.stringify({ address: "Test address", latitude: 25, longitude: 121, radius: 100 }),
    ],
  );
  await fixture.pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES($1,$2,'admin',1)",
    [id, userId],
  );
}
