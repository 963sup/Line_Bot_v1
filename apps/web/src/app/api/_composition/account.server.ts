import {
  PostgresFollowStore,
  PostgresGoogleLinkStore,
  PostgresLoginDirectoryStore,
  PostgresUserAchievementStore,
  PostgresUserProfileStore,
  PostgresUserStore,
} from "@line-work/account/adapters/postgres";
import { createUserAchievements } from "@line-work/account/application/achievements";
import { createFollows } from "@line-work/account/application/follows";
import { createLoginDirectory } from "@line-work/account/application/login-directory";
import { createUserProfiles } from "@line-work/account/application/profile";
import { createGoogleLink, createUser } from "@line-work/account/application/user";
import { requireActiveUser } from "@line-work/account/domain/user";
import { COIN_ASSET_CODE } from "@line-work/asset/domain";
import { PostgresDailyCheckInStore } from "@line-work/daily-check-in/adapters/postgres";
import { createDailyCheckIn } from "@line-work/daily-check-in/application";
import { protectPermissionAdministrator } from "@line-work/identity-access/adapters/postgres";
import { LINE_PROVIDER_NAMESPACE } from "@line-work/line-channel/provider";
import { PostgresWalletStore } from "@line-work/wallet/adapters/postgres";

const state = globalThis as typeof globalThis & {
  userStore?: PostgresUserStore;
  walletStore?: PostgresWalletStore;
  dailyCheckInStore?: PostgresDailyCheckInStore;
  followStore?: PostgresFollowStore;
  achievementStore?: PostgresUserAchievementStore;
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
function followStore() {
  return (state.followStore ??= new PostgresFollowStore());
}
function achievementStore() {
  return (state.achievementStore ??= new PostgresUserAchievementStore());
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
  repository: dailyCheckInStore,
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
export const achievements = createUserAchievements({
  activeUser: activeLineUser,
  store: achievementStore,
});
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

export function getUser(subject: string) {
  return user.getUser(subject);
}

export async function getCoinView(userId: string) {
  const [wallet, checkIn] = await Promise.all([
    walletStore().balance(userId, COIN_ASSET_CODE),
    dailyCheckIn.currentView(userId),
  ]);
  return { ...checkIn, balance: wallet.balance };
}

export const checkIn = dailyCheckIn.checkIn;
export const readClaim = dailyCheckIn.readClaim;
