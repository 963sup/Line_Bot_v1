import { normalizeAccountLogin } from "../domain/login.js";
import { requireActiveUser, UserError } from "../domain/user.js";
import type { VerifiedGoogleIdentity } from "./ports/identity-provider.js";
import type { GoogleLinkRepository, UserRepository } from "./ports/user-repository.js";

export interface UserDependencies {
  repository(): UserRepository;
  lineProvider(): string;
}

export function createUser(deps: UserDependencies) {
  return {
    /** Finds the User for a delivery-verified provider subject without expanding it. */
    findUser: (subject: string) => deps.repository().find(deps.lineProvider(), subject),

    /** Looks up the Account-owned User projection only. */
    getUser: async (subject: string) => {
      const account = await deps.repository().find(deps.lineProvider(), subject);
      return account ? deps.repository().view(account.id) : null;
    },

    /** Resolves a trusted provider subject to the stable ID needed by protected operations. */
    activeLineUser: async (subject: string) =>
      requireActiveUser(await deps.repository().find(deps.lineProvider(), subject)),

    /** Resolves an active User by its Account-owned login. */
    publicByLogin: async (value: string) => {
      try {
        return deps.repository().publicByLogin(normalizeAccountLogin(value));
      } catch {
        return null;
      }
    },

    /** Changes the current User locator without coupling it to Profile metadata. */
    updateLogin: async (subject: string, value: unknown) => {
      if (typeof value !== "string") throw new UserError(400, "登入名稱格式不正確。");
      let login: string;
      try {
        login = normalizeAccountLogin(value);
      } catch {
        throw new UserError(400, "登入名稱格式不正確或已保留。");
      }
      const account = requireActiveUser(await deps.repository().find(deps.lineProvider(), subject));
      return deps.repository().updateLogin(account.id, login, Date.now());
    },

    /** Explicit LINE registration; the repository returns the committed Account projection. */
    registerUser: (subject: string, value: unknown) => {
      if (typeof value !== "string") throw new UserError(400, "登入名稱格式不正確。");
      let login: string;
      try {
        login = normalizeAccountLogin(value);
      } catch {
        throw new UserError(400, "登入名稱格式不正確或已保留。");
      }
      return deps.repository().registerLine(deps.lineProvider(), subject, login);
    },

    /** A User may be paused by its verified owner only while active. */
    pauseUser: async (subject: string) => {
      const account = requireActiveUser(await deps.repository().find(deps.lineProvider(), subject));
      return deps.repository().pause(account.id);
    },

    restoreUser: (subject: string) => deps.repository().restoreLine(deps.lineProvider(), subject),
  };
}

export type UserUseCases = ReturnType<typeof createUser>;

/** LINE proof owns the request; Google proof may only fill its pending result. */
export function createGoogleLink(deps: {
  repository(): GoogleLinkRepository;
  lineProvider(): string;
  now(): number;
}) {
  return {
    start: (subject: string) => deps.repository().start(deps.lineProvider(), subject, deps.now()),
    pending: (subject: string) =>
      deps.repository().pending(deps.lineProvider(), subject, deps.now()),
    stage: (token: string, google: VerifiedGoogleIdentity) =>
      deps.repository().stage(token, google, deps.now()),
    confirm: (subject: string, id: string) =>
      deps.repository().confirm(deps.lineProvider(), subject, id, deps.now()),
    cancel: (subject: string, id: string) =>
      deps.repository().cancel(deps.lineProvider(), subject, id),
    unlink: (subject: string) => deps.repository().unlink(deps.lineProvider(), subject, deps.now()),
  };
}
