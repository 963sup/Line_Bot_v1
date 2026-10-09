import { createUserAchievements } from "@line_bot_v1/account/application/achievements";
import { createFollows } from "@line_bot_v1/account/application/follows";
import { createUserManagement } from "@line_bot_v1/account/application/manage-users";
import { createUserProfiles } from "@line_bot_v1/account/application/profile";
import { createGoogleLink, createUser } from "@line_bot_v1/account/application/user";
import { requireActiveUser } from "@line_bot_v1/account/domain/user";
import {
  PostgresFollowStore,
  PostgresGoogleLinkStore,
  PostgresUserAchievementStore,
  PostgresUserManagement,
  PostgresUserProfileStore,
  PostgresUserStore,
} from "@line_bot_v1/account/postgres";
import { supabaseIdentity } from "@line_bot_v1/account/supabase-identity";
import { COIN_ASSET_CODE } from "@line_bot_v1/asset/domain/value-objects/asset-code";
import { createDailyCheckIn } from "@line_bot_v1/daily-check-in/application/daily-check-in";
import { createPostgresDailyCheckInStore } from "@line_bot_v1/daily-check-in/composition/bootstrap/postgres-daily-check-in-store";
import {
  hasPermission,
  protectPermissionAdministrator,
} from "@line_bot_v1/identity-access/postgres";
import { LINE_PROVIDER_NAMESPACE } from "@line_bot_v1/line/provider";
import { PostgresWalletStore } from "@line_bot_v1/wallet/postgres";

const state = globalThis as typeof globalThis & {
  userStore?: PostgresUserStore;
  walletStore?: PostgresWalletStore;
  dailyCheckInStore?: ReturnType<typeof createPostgresDailyCheckInStore>;
  followStore?: PostgresFollowStore;
  achievementStore?: PostgresUserAchievementStore;
  profileStore?: PostgresUserProfileStore;
  userManagementStore?: PostgresUserManagement;
};

const accountAdministration = { hasPermission, protectPermissionAdministrator };

function userStore() {
  return (state.userStore ??= new PostgresUserStore(undefined, accountAdministration));
}
function walletStore() {
  return (state.walletStore ??= new PostgresWalletStore());
}
function dailyCheckInStore() {
  return (state.dailyCheckInStore ??= createPostgresDailyCheckInStore());
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
function userManagementStore() {
  return (state.userManagementStore ??= new PostgresUserManagement(
    undefined,
    accountAdministration,
  ));
}

const dailyCheckIn = createDailyCheckIn({
  activeUser: async (subject) =>
    requireActiveUser(await userStore().find(LINE_PROVIDER_NAMESPACE, subject)),
  store: dailyCheckInStore,
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
export const verifyGoogle = (token: string) => supabaseIdentity().verify(token);

export const {
  findUser,
  activeLineUser,
  publicById: publicUserById,
  updateLogin,
  registerUser,
  pauseUser,
  restoreUser,
} = user;
export const userManagement = createUserManagement({
  activeUser: activeLineUser,
  repository: userManagementStore,
  now: () => Date.now(),
});
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
