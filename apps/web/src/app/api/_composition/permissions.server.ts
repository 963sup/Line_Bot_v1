import { PostgresPermissionStore } from "@line_bot_v1/identity-access/postgres";
import { createPermissions } from "@line_bot_v1/identity-access/application/permissions";
import { activeLineUser } from "./account.server";

export const permissions = createPermissions({
  activeUser: activeLineUser,
  store: () => new PostgresPermissionStore(),
  now: () => Date.now(),
});
