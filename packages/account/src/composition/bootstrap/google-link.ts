import { businessDatabase, type Database } from "@line_bot_v1/platform/postgres";
import { PostgresGoogleLinkPersistence } from "../../adapters/outbound/persistence/google-link.js";
import { PostgresUserPersistence } from "../../adapters/outbound/persistence/user.js";
import { createGoogleLinkRequests } from "../../application/use-cases/google-link.js";
import type { GoogleLinkRepository } from "../../contracts/input/user.js";
import type { VerifiedGoogleIdentity } from "../../contracts/output/identity-provider.js";

export class PostgresGoogleLinkStore implements GoogleLinkRepository {
  private readonly commands: ReturnType<typeof createGoogleLinkRequests>;
  constructor(db: Database = businessDatabase()) {
    const persistence = new PostgresGoogleLinkPersistence(
      db,
      (scoped) => new PostgresUserPersistence(scoped),
    );
    this.commands = createGoogleLinkRequests(persistence);
  }
  async start(provider: string, subject: string, now: number) {
    return this.commands.start(provider, subject, now);
  }
  async stage(token: string, google: VerifiedGoogleIdentity, now: number) {
    return this.commands.stage(token, google, now);
  }
  async pending(provider: string, subject: string, now: number) {
    return this.commands.pending(provider, subject, now);
  }
  async confirm(provider: string, subject: string, id: string, now: number) {
    return this.commands.confirm(provider, subject, id, now);
  }
  async cancel(provider: string, subject: string, id: string) {
    return this.commands.cancel(provider, subject, id);
  }
  async unlink(provider: string, subject: string, now: number) {
    return this.commands.unlink(provider, subject, now);
  }
}
