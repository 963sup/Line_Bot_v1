import type { VerifiedGoogleIdentity } from "../../contracts/output/identity-provider.js";
import type { UserTransactions } from "../../contracts/output/user-transactions.js";
import {
  assertExistingGoogleBinding,
  assertUserLoginChange,
  confirmUserRegistration,
  decideGoogleUserBinding,
  decideLineUser,
  pauseUser,
  registerUser,
  requireRegisteredLineUser,
  suspendUser,
  UserError,
} from "../../domain/user.js";

function lineIdentity(provider: string, subject: string) {
  if (!/^line:[\w-]{1,80}$/.test(provider) || !/^U[a-f0-9]{32}$/i.test(subject))
    throw new UserError(400, "LINE 身分不正確。");
}

export async function changeLineUser(
  store: UserTransactions,
  provider: string,
  subject: string,
  operation: "register" | "restore",
  login: string | null,
  now: number,
) {
  lineIdentity(provider, subject);
  return store.identity(provider, subject, async (transaction) => {
    const current = await transaction.lineUser(provider, subject);
    const decision = decideLineUser(operation, current?.user ?? null);
    if (decision.kind === "create") {
      const next = registerUser(transaction.newId(), now);
      await transaction.insert(next.user);
      if (!login) throw new UserError(400, "登入名稱格式不正確。");
      await transaction.claimLogin(next.user.id, login, now);
      await transaction.recordLineIdentity(next.user.id, provider, subject);
      await transaction.audit(next.user.id, next.event, now);
      return transaction.view(next.user.id);
    }
    if (decision.kind === "confirm") {
      if (!login) throw new UserError(400, "登入名稱格式不正確。");
      confirmUserRegistration(decision.user, login, await transaction.login(decision.user.id));
    } else if (decision.kind === "restore") {
      await transaction.saveStatus(decision.user);
      await transaction.audit(decision.user.id, decision.event, now);
    }
    return transaction.view(decision.user.id);
  });
}

export async function bindGoogleUser(
  store: UserTransactions,
  provider: string,
  subject: string,
  google: VerifiedGoogleIdentity,
  now: number,
) {
  lineIdentity(provider, subject);
  return store.binding(provider, subject, async (transaction) => {
    const current = await transaction.lineUser(provider, subject);
    const user = requireRegisteredLineUser(current?.user ?? null);
    assertExistingGoogleBinding(
      current?.authUserId ?? null,
      await transaction.googleSubject(user.id),
      google.id,
      google.sub,
    );
    const next = decideGoogleUserBinding(
      user,
      current?.authUserId ?? null,
      google.id,
      await transaction.googleOwner(google.sub),
    );
    await transaction.saveGoogleBinding(next.user, google);
    if (next.event) await transaction.audit(user.id, next.event, now);
    return { ...next.user, auth_user_id: google.id };
  });
}

export function changeUserLogin(
  store: UserTransactions,
  id: string,
  login: string,
  expectedLogin: string,
  now: number,
) {
  return store.rename(async (transaction) => {
    assertUserLoginChange(await transaction.user(id));
    await transaction.renameLogin(id, expectedLogin, login, now);
    return transaction.view(id);
  });
}

export function pauseCurrentUser(
  store: UserTransactions,
  id: string,
  now: () => number,
  authId?: string,
) {
  return store.lifecycle(async (transaction) => {
    await transaction.protectAdministrator(id);
    const next = pauseUser(await transaction.qualify(id, authId));
    await transaction.saveStatus(next.user);
    await transaction.audit(id, next.event, now());
    return transaction.view(id);
  });
}

export function suspendCurrentUser(store: UserTransactions, id: string, now: () => number) {
  return store.lifecycle(async (transaction) => {
    await transaction.protectAdministrator(id);
    const next = suspendUser(await transaction.user(id));
    await transaction.saveStatus(next.user);
    await transaction.audit(id, next.event, now());
  });
}
