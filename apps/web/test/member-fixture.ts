import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { PostgresUserStore } from "@line_bot_v1/account/postgres";
import { supabaseIdentity } from "@line_bot_v1/account/supabase-identity";
import { createPostgresAttendanceStore } from "@line_bot_v1/attendance/composition/bootstrap/postgres-attendance-store";
import { createPostgresDailyCheckInStore } from "@line_bot_v1/daily-check-in/composition/bootstrap/postgres-daily-check-in-store";
import { createPostgresExpenseStore } from "@line_bot_v1/expense/composition/bootstrap/postgres-expense-store";
import { protectPermissionAdministrator } from "@line_bot_v1/identity-access/postgres";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line-channel/provider";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { PostgresWalletStore } from "@line_bot_v1/wallet/postgres";
import type { WebhookIdempotencyStore } from "../src/app/api/_composition/line-webhook-router.server";
import { idempotencyFixture } from "./idempotency-fixture";

type AttendancePersistence = ReturnType<typeof createPostgresAttendanceStore>;
let fixture: Awaited<ReturnType<typeof postgresFixture>>;
const state = globalThis as typeof globalThis & {
  userStore?: PostgresUserStore;
  dailyCheckInStore?: ReturnType<typeof createPostgresDailyCheckInStore>;
  walletStore?: PostgresWalletStore;
  attendanceStore?: AttendancePersistence;
  expenseStore?: ReturnType<typeof createPostgresExpenseStore>;
  lineIdempotency?: WebhookIdempotencyStore;
};
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
  state.lineIdempotency = idempotencyFixture();
  fixture = await postgresFixture();
  state.userStore = new PostgresUserStore(fixture.db, {
    protectPermissionAdministrator,
  });
  state.dailyCheckInStore = createPostgresDailyCheckInStore(fixture.db);
  state.walletStore = new PostgresWalletStore(fixture.db);
  state.attendanceStore = createPostgresAttendanceStore(fixture.db);
  state.expenseStore = createPostgresExpenseStore(fixture.db);
  mock.method(supabaseIdentity(), "verify", async (token: string) => {
    const response = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { userId } = await response.json();
    return identityFor(userId);
  });
}
export function memberStore() {
  return state.userStore!;
}
export function walletStore() {
  return state.walletStore!;
}
export function expenseStore() {
  return state.expenseStore!;
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

export async function allowAttendance(memberId: string) {
  const id = randomUUID();
  await fixture.pg.query(
    `INSERT INTO app_private.repositories(id,owner_account_id,owner_account_kind,name,visibility,version,address)
     VALUES($1,$2,'USER',$1,'private',1,$3)`,
    [
      id,
      memberId,
      JSON.stringify({ address: "Test address", latitude: 25, longitude: 121, radius: 100 }),
    ],
  );
  await fixture.pg.query(
    "INSERT INTO app_private.repository_access(repository_id,principal_id,capability,version) VALUES($1,$2,'admin',1)",
    [id, memberId],
  );
}
