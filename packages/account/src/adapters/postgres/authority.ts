import type { Sql } from "@line-work/platform/adapters/postgres";
import { UserError } from "../../domain/user.js";

export interface AccountAdministrationGuard {
  protectPermissionAdministrator(sql: Sql, id: string): Promise<void>;
}

export interface UserManagementAuthorization extends AccountAdministrationGuard {
  hasPermission(
    sql: Sql,
    actor: string,
    permission: "users.read" | "users.suspend",
  ): Promise<boolean>;
}

export const unavailableAccountAuthorization: UserManagementAuthorization = {
  async protectPermissionAdministrator() {
    throw new UserError(503, "使用者權限服務暫不可用。");
  },
  async hasPermission() {
    throw new UserError(503, "使用者權限服務暫不可用。");
  },
};
