import { createPermissions } from "@line_bot_v1/identity-access/application/permissions";
import { PostgresPermissionStore } from "@line_bot_v1/identity-access/postgres";
import { activeLineUser } from "./account.server";

export const permissions = createPermissions({
  activeUser: activeLineUser,
  store: () => new PostgresPermissionStore(),
  now: () => Date.now(),
});
