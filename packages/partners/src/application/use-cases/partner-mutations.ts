import type { PartnerMutationTransactions } from "../../contracts/output/partner-mutations.js";
import {
  assertUniquePartnerContact,
  decidePartnerReferral,
  type PartnerReferralState,
  PartnerError,
  partnerAssert,
  preparePartnerSave,
} from "../../domain.js";
import type { PartnerCommand } from "../commands/partner-command.js";

function referralContact(referral: PartnerReferralState) {
  return {
    partnerName: referral.partnerName,
    contactName: referral.contactName,
    phone: referral.method === "phone" ? referral.value : "",
    email: referral.method === "email" ? referral.value : "",
    line: referral.method === "line" ? referral.value : "",
  };
}

export function executePartnerCommand(
  transactions: PartnerMutationTransactions,
  actor: string,
  command: PartnerCommand,
  now: number,
) {
  const request =
    command.action === "save-partner"
      ? ({
          kind: "management",
          requestId: command.requestId,
          payload: JSON.stringify(command),
          at: now,
          partnerId: command.id,
          previousVersion: command.expectedVersion,
          reason: command.reason,
        } as const)
      : ({
          kind: "referral",
          requestId: command.requestId,
          payload: JSON.stringify(command),
          at: now,
          action: command.action,
        } as const);

  return transactions.run(actor, request, async (transaction) => {
    // An administrator must still have current permission on exact replay.
    if (command.action === "save-partner") {
      partnerAssert(await transaction.canManage(), 403, "需要合作夥伴管理權限。");
    }
    const replay = await transaction.replay();
    if (replay) return replay;

    if (command.action === "save-partner") {
      const currentVersion = await transaction.partnerVersion(command.id);
      const existing = await transaction.existingContacts(
        command.id,
        command.contacts.map((contact) => contact.id),
      );
      const next = preparePartnerSave(command, currentVersion, existing);
      for (const contact of next.contacts) {
        if (next.status === "published" && contact.status === "published") {
          const duplicate = await transaction.duplicateContact({
            partnerName: next.name,
            contactName: contact.name,
            phone: contact.phone,
            email: contact.email,
            line: contact.line,
            exceptPartnerId: next.id,
          });
          assertUniquePartnerContact(duplicate);
        }
      }
      await transaction.savePartner(next);
      partnerAssert(await transaction.canManage(), 403, "合作夥伴管理權限已撤銷。");
      const receipt = { id: next.id, version: next.version, at: now, requestId: command.requestId };
      await transaction.record(receipt);
      return receipt;
    }

    if (command.action === "refer") {
      const id = await transaction.refer(command);
      const receipt = { id };
      await transaction.record(receipt);
      return receipt;
    }

    const referral = await transaction.referral(command.referralId);
    partnerAssert(referral, 404, "推薦案件不存在。");
    const decision = decidePartnerReferral(command, referral, actor, transaction.canReview);
    if (decision === "withdrawn") await transaction.withdraw(command.referralId);
    else if (decision === "rejected") {
      await transaction.reject(command.referralId, command.reviewNote ?? "");
    } else {
      assertUniquePartnerContact(await transaction.duplicateContact(referralContact(referral)));
      await transaction.publish(command.referralId, referral, command.reviewNote ?? "");
    }
    const receipt = { id: command.referralId };
    await transaction.record(receipt);
    return receipt;
  });
}
