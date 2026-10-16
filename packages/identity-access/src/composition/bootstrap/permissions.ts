import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresPermissionPersistence } from "../../adapters/outbound/persistence/permissions.js";
import type { PermissionCommand } from "../../application/commands/permission.js";
import { changePermission } from "../../application/use-cases/change-permission.js";
import type { PermissionStore } from "../../contracts/input/permissions.js";

/** Existing public entry assembles the permission use case and concrete transaction/query adapter. */
export class PostgresPermissionStore implements PermissionStore {
  private readonly transactions: PostgresPermissionPersistence;
  constructor(db: Database = businessDatabase()) {
    this.transactions = new PostgresPermissionPersistence(db);
  }
  read(actor: string, target: string) {
    return this.transactions.read(actor, target);
  }
  change(actor: string, command: PermissionCommand, now: number) {
    return changePermission(this.transactions, actor, command, now);
  }
}
