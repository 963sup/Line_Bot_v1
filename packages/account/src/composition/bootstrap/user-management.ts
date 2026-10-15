import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresUserManagementPersistence } from "../../adapters/outbound/persistence/user-management.js";
import { changeUserStatus } from "../../application/use-cases/change-user-status.js";
import type { UserManagementRepository } from "../../contracts/input/user-management.js";
import type { UserManagementQuery } from "../../contracts/user-management.js";
import type { UserStatusCommand } from "../../domain/user.js";
import {
  type UserManagementAuthorization,
  unavailableAccountAuthorization,
} from "../../postgres/authority.js";

export class PostgresUserManagement implements UserManagementRepository {
  private readonly persistence: PostgresUserManagementPersistence;
  constructor(
    db: Database = businessDatabase(),
    authorization: UserManagementAuthorization = unavailableAccountAuthorization,
  ) {
    this.persistence = new PostgresUserManagementPersistence(db, authorization);
  }
  view(actor: string, query: UserManagementQuery) {
    return this.persistence.view(actor, query);
  }
  execute(actor: string, command: UserStatusCommand, now: number) {
    return changeUserStatus(this.persistence, actor, command, now);
  }
}
