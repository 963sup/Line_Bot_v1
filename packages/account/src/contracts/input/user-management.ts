import type {
  UserManagementQuery,
  UserManagementView,
  UserStatusReceipt,
  UserStatusRequest,
} from "../user-management.js";

/** Published typed administration capability; retained name is part of the public API. */
export interface UserManagementRepository {
  view(actor: string, query: UserManagementQuery): Promise<UserManagementView>;
  execute(actor: string, command: UserStatusRequest, now: number): Promise<UserStatusReceipt>;
}
