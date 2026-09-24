import { randomUUID } from "node:crypto";
import { mock } from "node:test";
import { PostgresUserStore } from "@line-work/account/adapters/postgres";
import { supabaseIdentity } from "@line-work/account/adapters/supabase-identity";
import { PostgresAttendanceStore } from "@line-work/attendance/adapters/postgres";
import { PostgresDailyCheckInStore } from "@line-work/daily-check-in/adapters/postgres";
import { PostgresExpenseStore } from "@line-work/expense/adapters/postgres";
import { protectPermissionAdministrator } from "@line-work/identity-access/adapters/postgres";
import { PostgresLedgerStore } from "@line-work/ledger/adapters/postgres";
import { LINE_PROVIDER_NAMESPACE } from "@line-work/line-channel/provider";
import { postgresFixture } from "@line-work/platform/testing/postgres";
import { PostgresWalletStore } from "@line-work/wallet/adapters/postgres";
import type { WebhookIdempotencyStore } from "../src/app/api/_composition/line-webhook-router.server";
import { idempotencyFixture } from "./idempotency-fixture";

let fixture: Awaited<ReturnType<typeof postgresFixture>>;
const state = globalThis as typeof globalThis & {
  userStore?: PostgresUserStore;
  dailyCheckInStore?: PostgresDailyCheckInStore;
  walletStore?: PostgresWalletStore;
  ledgerStore?: PostgresLedgerStore;
  attendanceStore?: PostgresAttendanceStore;
  expenseStore?: PostgresExpenseStore;
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
  state.dailyCheckInStore = new PostgresDailyCheckInStore(fixture.db);
  state.walletStore = new PostgresWalletStore(fixture.db);
  state.ledgerStore = new PostgresLedgerStore(fixture.db);
  state.attendanceStore = new PostgresAttendanceStore(fixture.db);
  state.expenseStore = new PostgresExpenseStore(fixture.db);
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
export function ledgerStore() {
  return state.ledgerStore!;
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
    "INSERT INTO app_private.workplaces(id,name,description,latitude,longitude,radius,enabled,version) VALUES($1,'Test','',25,121,100,true,1)",
    [id],
  );
  await fixture.pg.query(
    "INSERT INTO app_private.workplace_members(workplace_id,member_id) VALUES($1,$2)",
    [id, memberId],
  );
}
