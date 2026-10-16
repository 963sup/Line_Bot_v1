import { createUserProfileStatuses } from "@line_bot_v1/account/application/user-profile-status";
import { PostgresUserProfileStatusPersistence } from "@line_bot_v1/account/postgres";
import { activeLineUser } from "./account.server";

let instance: PostgresUserProfileStatusPersistence | undefined;
function persistence() {
  return (instance ??= new PostgresUserProfileStatusPersistence());
}

export const profileStatuses = createUserProfileStatuses({
  activeUser: activeLineUser,
  store: persistence,
  persistence,
  now: () => Date.now(),
});
