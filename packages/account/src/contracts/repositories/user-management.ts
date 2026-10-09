import type {
  UserManagementQuery,
  UserManagementView,
  UserStatusReceipt,
} from "../../contracts/user-management.js";
import type { UserStatusCommand } from "../../domain/user.js";

export interface UserManagementRepository {
  view(actor: string, query: UserManagementQuery): Promise<UserManagementView>;
  execute(actor: string, command: UserStatusCommand, now: number): Promise<UserStatusReceipt>;
}
