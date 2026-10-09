import type { UserManagementRepository } from "../contracts/repositories/user-management.js";
import type { UserManagementQuery } from "../contracts/user-management.js";
import { parseUserStatusCommand, UserError } from "../domain/user.js";
export function createUserManagement(deps: {
  activeUser(subject: string): Promise<{ id: string }>;
  repository(): UserManagementRepository;
  now(): number;
}) {
  return {
    async view(subject: string, query: UserManagementQuery) {
      const actor = await deps.activeUser(subject);
      if (
        (query.id !== undefined && !/^[\w-]{1,128}$/.test(query.id)) ||
        (query.after !== undefined && !/^[\w-]{1,128}$/.test(query.after)) ||
        (query.status !== undefined && !["active", "paused", "suspended"].includes(query.status)) ||
        (query.id && (query.after || query.status))
      )
        throw new UserError(400, "會員查詢條件不正確。");
      return deps.repository().view(actor.id, query);
    },
    async execute(subject: string, raw: unknown) {
      const actor = await deps.activeUser(subject);
      return deps.repository().execute(actor.id, parseUserStatusCommand(raw), deps.now());
    },
  };
}

export type UserManagementUseCases = ReturnType<typeof createUserManagement>;
