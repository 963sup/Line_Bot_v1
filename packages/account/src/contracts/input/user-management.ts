import type { UserStatusCommand } from "../../domain/user.js";
import type {
  UserManagementQuery,
  UserManagementView,
  UserStatusReceipt,
} from "../user-management.js";

/** Published typed administration capability; retained name is part of the public API. */
export interface UserManagementRepository {
  view(actor: string, query: UserManagementQuery): Promise<UserManagementView>;
  execute(actor: string, command: UserStatusCommand, now: number): Promise<UserStatusReceipt>;
}
