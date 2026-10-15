import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresUserPersistence } from "../../adapters/outbound/persistence/user.js";
import {
  bindGoogleUser,
  changeLineUser,
  changeUserLogin,
  pauseCurrentUser,
  suspendCurrentUser,
} from "../../application/use-cases/user-lifecycle.js";
import type { UserRepository } from "../../contracts/input/user.js";
import type { VerifiedGoogleIdentity } from "../../contracts/output/identity-provider.js";
import {
  type AccountAdministrationGuard,
  unavailableAccountAuthorization,
} from "../../postgres/authority.js";

export class PostgresUserStore implements UserRepository {
  private readonly persistence: PostgresUserPersistence;
  constructor(
    db: Database = businessDatabase(),
    administration: AccountAdministrationGuard = unavailableAccountAuthorization,
  ) {
    this.persistence = new PostgresUserPersistence(db, administration);
  }
  get(id: string) {
    return this.persistence.get(id);
  }
  publicById(id: string) {
    return this.persistence.publicById(id);
  }
  find(provider: string, subject: string) {
    return this.persistence.find(provider, subject);
  }
  viewByIdentity(provider: string, subject: string) {
    return this.persistence.viewByIdentity(provider, subject);
  }
  googleIdentity(id: string) {
    return this.persistence.googleIdentity(id);
  }
  view(id: string) {
    return this.persistence.view(id);
  }
  updateLogin(id: string, login: string, expectedLogin: string, now: number) {
    return changeUserLogin(this.persistence, id, login, expectedLogin, now);
  }
  registerLine(provider: string, subject: string, login: string, now = Date.now()) {
    return changeLineUser(this.persistence, provider, subject, "register", login, now);
  }
  restoreLine(provider: string, subject: string, now = Date.now()) {
    return changeLineUser(this.persistence, provider, subject, "restore", null, now);
  }
  async bind(provider: string, subject: string, google: VerifiedGoogleIdentity, now = Date.now()) {
    return bindGoogleUser(this.persistence, provider, subject, google, now);
  }
  pause(id: string, authId?: string) {
    return pauseCurrentUser(this.persistence, id, Date.now, authId);
  }
  suspend(id: string) {
    return suspendCurrentUser(this.persistence, id, Date.now);
  }
}
