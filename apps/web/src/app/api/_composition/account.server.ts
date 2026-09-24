import {
  PostgresFollowStore,
  PostgresGoogleLinkStore,
  PostgresLoginDirectoryStore,
  PostgresUserProfileStore,
  PostgresUserStore,
} from "@line-work/account/adapters/postgres";
import { createFollows } from "@line-work/account/application/follows";
import { createLoginDirectory } from "@line-work/account/application/login-directory";
import { createUserProfiles } from "@line-work/account/application/profile";
import { createGoogleLink, createUser } from "@line-work/account/application/user";
import { requireActiveUser } from "@line-work/account/domain/user";
import { COIN_ASSET_CODE } from "@line-work/asset/domain";
import { PostgresDailyCheckInStore } from "@line-work/daily-check-in/adapters/postgres";
import { createDailyCheckIn } from "@line-work/daily-check-in/application";
import { DAILY_CHECK_IN_LEDGER_SOURCE } from "@line-work/daily-check-in/domain";
import { protectPermissionAdministrator } from "@line-work/identity-access/adapters/postgres";
import { PostgresLedgerStore } from "@line-work/ledger/adapters/postgres";
import { LINE_PROVIDER_NAMESPACE } from "@line-work/line-channel/provider";
import { PostgresWalletStore } from "@line-work/wallet/adapters/postgres";

const state = globalThis as typeof globalThis & {
  userStore?: PostgresUserStore;
  walletStore?: PostgresWalletStore;
  dailyCheckInStore?: PostgresDailyCheckInStore;
  ledgerStore?: PostgresLedgerStore;
  followStore?: PostgresFollowStore;
  profileStore?: PostgresUserProfileStore;
  loginDirectoryStore?: PostgresLoginDirectoryStore;
};

const accountAdministration = { protectPermissionAdministrator };

function userStore() {
  return (state.userStore ??= new PostgresUserStore(undefined, accountAdministration));
}
function walletStore() {
  return (state.walletStore ??= new PostgresWalletStore());
}
function dailyCheckInStore() {
  return (state.dailyCheckInStore ??= new PostgresDailyCheckInStore());
}
function ledgerStore() {
  return (state.ledgerStore ??= new PostgresLedgerStore());
}
function followStore() {
  return (state.followStore ??= new PostgresFollowStore());
}
function profileStore() {
  return (state.profileStore ??= new PostgresUserProfileStore());
}
function loginDirectoryStore() {
  return (state.loginDirectoryStore ??= new PostgresLoginDirectoryStore());
}

const dailyCheckIn = createDailyCheckIn({
  activeUser: async (subject) =>
    requireActiveUser(await userStore().find(LINE_PROVIDER_NAMESPACE, subject)),
  member: (userId) => userStore().view(userId),
  repository: dailyCheckInStore,
  coinBalance: async (userId) => (await walletStore().balance(userId, COIN_ASSET_CODE)).balance,
  claimedToday: (userId, day) =>
    ledgerStore().hasEntry(userId, COIN_ASSET_CODE, DAILY_CHECK_IN_LEDGER_SOURCE, day),
  now: () => Date.now(),
});
const user = createUser({
  repository: userStore,
  lineProvider: () => LINE_PROVIDER_NAMESPACE,
});
export const googleLink = createGoogleLink({
  repository: () => new PostgresGoogleLinkStore(),
  lineProvider: () => LINE_PROVIDER_NAMESPACE,
  now: () => Date.now(),
});

export const {
  findUser,
  activeLineUser,
  publicByLogin: publicUserByLogin,
  updateLogin,
  registerUser,
  pauseUser,
  restoreUser,
} = user;
export const loginDirectory = createLoginDirectory(loginDirectoryStore);
export const follows = createFollows({
  activeUser: activeLineUser,
  store: followStore,
  now: () => Date.now(),
});
export const profiles = createUserProfiles({
  activeUser: activeLineUser,
  store: profileStore,
  now: () => Date.now(),
});

export async function getUser(subject: string) {
  const account = await user.getUser(subject);
  return account
    ? { ...account, coins: await dailyCheckIn.coinView(account.id, Date.now()) }
    : null;
}

export const checkIn = dailyCheckIn.checkIn;
