export type PartnerStatus = "published" | "unlisted";
export type ContactMethod = "phone" | "email" | "line";
export type ReferralStatus = "pending" | "successful" | "rejected" | "withdrawn";

export type PartnerContact = {
  id: string;
  partnerId: string;
  name: string;
  responsibility: string;
  phone: string;
  email: string;
  line: string;
  status: PartnerStatus;
};

export type Partner = {
  id: string;
  name: string;
  category: string;
  region: string;
  status: PartnerStatus;
  contacts: PartnerContact[];
  version: number;
};

export type PartnerNewsItem = {
  referralId: string;
  partnerId: string;
  contactId: string;
  partnerName: string;
  category: string;
  contactName: string;
  responsibility: string;
  successfulAt: number;
};

export type PartnerReferral = {
  id: string;
  partnerName: string;
  category: string;
  region: string;
  contactName: string;
  responsibility: string;
  method: ContactMethod;
  value: string;
  reason: string;
  status: ReferralStatus;
  submittedAt: number;
  reviewedAt: number | null;
  reviewNote: string;
};

export type PartnerView = "news" | "directory" | "referrals" | "manage";
export type PartnersView = {
  next?: string | null;
  userId: string;
  partners: Partner[];
  news: PartnerNewsItem[];
  referrals: PartnerReferral[];
  /** Omitted from the management view, which does not expose referral-review grants. */
  canReview?: boolean;
};
