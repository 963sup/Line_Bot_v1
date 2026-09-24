import { PostgresPermissionStore } from "@line-work/identity-access/adapters/postgres";
import { createPermissions } from "@line-work/identity-access/application/permissions";
import { activeLineUser } from "./account.server";

export const permissions = createPermissions({
  activeUser: activeLineUser,
  store: () => new PostgresPermissionStore(),
  now: () => Date.now(),
});
