import type { GoogleLinkTransactions } from "../../contracts/output/google-link-transactions.js";
import type { VerifiedGoogleIdentity } from "../../contracts/output/identity-provider.js";
import {
  confirmGoogleLink,
  expiredGoogleLink,
  newGoogleLinkRequest,
  requireGoogleLinkOwner,
  stageGoogleLink,
  unlinkGoogleLink,
} from "../../domain/google-link.js";
import { bindGoogleUser } from "./user-lifecycle.js";

export function createGoogleLinkRequests(store: GoogleLinkTransactions) {
  return {
    start(provider: string, subject: string, now: number) {
      return store.transact(async (transaction) => {
        const owner = requireGoogleLinkOwner(await transaction.owner(provider, subject));
        const request = newGoogleLinkRequest(owner, now);
        await transaction.expire(owner.id, now);
        const token = transaction.token();
        await transaction.insert(request, token);
        return { token };
      });
    },
    async stage(token: string, google: VerifiedGoogleIdentity, now: number) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw expiredGoogleLink();
      await store.transact(async (transaction) => {
        const request = await transaction.stageRequest(token, now);
        const id = stageGoogleLink(request, google.id, google.sub);
        if (id !== null) await transaction.saveStage(id, google);
      });
    },
    pending(provider: string, subject: string, now: number) {
      return store.transact(async (transaction) => {
        const owner = requireGoogleLinkOwner(await transaction.owner(provider, subject));
        return transaction.pending(owner.id, owner.statusVersion, now);
      });
    },
    async confirm(provider: string, subject: string, id: string, now: number) {
      await store.transact(async (transaction) => {
        const owner = requireGoogleLinkOwner(await transaction.owner(provider, subject));
        const identity = confirmGoogleLink(
          await transaction.confirmation(id, owner.id, owner.statusVersion, now),
        );
        await bindGoogleUser(
          transaction.users,
          provider,
          subject,
          { id: identity.id, sub: identity.subject, email: identity.email },
          now,
        );
        await transaction.drop(id);
      });
    },
    async cancel(provider: string, subject: string, id: string) {
      await store.transact(async (transaction) => {
        const owner = requireGoogleLinkOwner(await transaction.owner(provider, subject));
        await transaction.cancel(id, owner.id);
      });
    },
    async unlink(provider: string, subject: string, now: number) {
      await store.transact(async (transaction) => {
        const owner = requireGoogleLinkOwner(await transaction.owner(provider, subject));
        const decision = unlinkGoogleLink(await transaction.linked(owner.id));
        await transaction.unlink(owner.id);
        await transaction.clear(owner.id);
        await transaction.audit(owner.id, decision.event, now);
      });
    },
  };
}
