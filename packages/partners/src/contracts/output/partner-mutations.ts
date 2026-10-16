import type {
  PartnerReferralState,
  PartnerSaveDraft,
  StoredPartnerContact,
} from "../../domain.js";

export type PartnerReceipt = { id: string; version?: number; at?: number; requestId?: string };

export type PartnerMutationRequest =
  | {
      kind: "management";
      requestId: string;
      payload: string;
      at: number;
      partnerId: string;
      previousVersion: number;
      reason: string;
    }
  | {
      kind: "referral";
      requestId: string;
      payload: string;
      at: number;
      action: "refer" | "review" | "withdraw";
    };

export type PartnerPublishedContact = {
  partnerName: string;
  contactName: string;
  phone: string;
  email: string;
  line: string;
  exceptPartnerId?: string;
};

type PartnerSave = PartnerSaveDraft & { version: number };

export interface PartnerMutationTransaction {
  readonly canReview: boolean;
  canManage(): Promise<boolean>;
  replay(): Promise<PartnerReceipt | null>;
  record(result: PartnerReceipt): Promise<void>;

  partnerVersion(id: string): Promise<number | null>;
  existingContacts(id: string, contactIds: readonly string[]): Promise<StoredPartnerContact[]>;
  duplicateContact(contact: PartnerPublishedContact): Promise<boolean>;
  lockDirectory(): Promise<void>;
  savePartner(next: PartnerSave): Promise<void>;

  refer(input: {
    partnerName: string;
    category: string;
    region?: string;
    contactName: string;
    responsibility: string;
    method: "phone" | "email" | "line";
    value: string;
    reason: string;
  }): Promise<string>;
  referral(id: string): Promise<PartnerReferralState | null>;
  withdraw(id: string): Promise<void>;
  reject(id: string, note: string): Promise<void>;
  publish(id: string, state: PartnerReferralState, note: string): Promise<void>;
}

/** A single database transaction encloses qualification, exact replay and all authoritative effects. */
export interface PartnerMutationTransactions {
  run<T extends PartnerReceipt>(
    actor: string,
    request: PartnerMutationRequest,
    work: (transaction: PartnerMutationTransaction) => Promise<T>,
  ): Promise<T>;
}
