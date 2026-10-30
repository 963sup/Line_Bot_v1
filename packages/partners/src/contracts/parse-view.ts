import { isRecord } from "@line_bot_v1/platform/validation";
import type {
  Partner,
  PartnerContact,
  PartnerNewsItem,
  PartnerReferral,
  PartnersView,
} from "../contracts.js";
export function readPartnersView(value: unknown): PartnersView {
  if (
    !isRecord(value) ||
    typeof value.userId !== "string" ||
    !Array.isArray(value.partners) ||
    !Array.isArray(value.news) ||
    !Array.isArray(value.referrals) ||
    (value.next !== undefined && value.next !== null && typeof value.next !== "string") ||
    (value.canReview !== undefined && typeof value.canReview !== "boolean")
  )
    throw new Error("夥伴服務回應格式不完整。");
  const partners = value.partners.map((partner): Partner => {
    if (
      !isRecord(partner) ||
      typeof partner.id !== "string" ||
      typeof partner.name !== "string" ||
      typeof partner.category !== "string" ||
      typeof partner.region !== "string" ||
      (partner.status !== "published" && partner.status !== "unlisted") ||
      !Array.isArray(partner.contacts) ||
      typeof partner.version !== "number"
    )
      throw new Error("夥伴服務回應格式不完整。");
    const contacts = partner.contacts.map((contact): PartnerContact => {
      if (
        !isRecord(contact) ||
        typeof contact.id !== "string" ||
        typeof contact.partnerId !== "string" ||
        typeof contact.name !== "string" ||
        typeof contact.responsibility !== "string" ||
        typeof contact.phone !== "string" ||
        typeof contact.email !== "string" ||
        typeof contact.line !== "string" ||
        (contact.status !== "published" && contact.status !== "unlisted")
      )
        throw new Error("夥伴服務回應格式不完整。");
      return {
        id: contact.id,
        partnerId: contact.partnerId,
        name: contact.name,
        responsibility: contact.responsibility,
        phone: contact.phone,
        email: contact.email,
        line: contact.line,
        status: contact.status,
      };
    });
    return {
      id: partner.id,
      name: partner.name,
      category: partner.category,
      region: partner.region,
      status: partner.status,
      contacts,
      version: partner.version,
    };
  });
  const news = value.news.map((item): PartnerNewsItem => {
    if (
      !isRecord(item) ||
      typeof item.referralId !== "string" ||
      typeof item.partnerId !== "string" ||
      typeof item.contactId !== "string" ||
      typeof item.partnerName !== "string" ||
      typeof item.category !== "string" ||
      typeof item.contactName !== "string" ||
      typeof item.responsibility !== "string" ||
      typeof item.successfulAt !== "number"
    )
      throw new Error("夥伴服務回應格式不完整。");
    return {
      referralId: item.referralId,
      partnerId: item.partnerId,
      contactId: item.contactId,
      partnerName: item.partnerName,
      category: item.category,
      contactName: item.contactName,
      responsibility: item.responsibility,
      successfulAt: item.successfulAt,
    };
  });
  const referrals = value.referrals.map((item): PartnerReferral => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.partnerName !== "string" ||
      typeof item.category !== "string" ||
      typeof item.region !== "string" ||
      typeof item.contactName !== "string" ||
      typeof item.responsibility !== "string" ||
      (item.method !== "phone" && item.method !== "email" && item.method !== "line") ||
      typeof item.value !== "string" ||
      typeof item.reason !== "string" ||
      (item.status !== "pending" &&
        item.status !== "successful" &&
        item.status !== "rejected" &&
        item.status !== "withdrawn") ||
      typeof item.submittedAt !== "number" ||
      (item.reviewedAt !== null && typeof item.reviewedAt !== "number") ||
      typeof item.reviewNote !== "string"
    )
      throw new Error("夥伴服務回應格式不完整。");
    return {
      id: item.id,
      partnerName: item.partnerName,
      category: item.category,
      region: item.region,
      contactName: item.contactName,
      responsibility: item.responsibility,
      method: item.method,
      value: item.value,
      reason: item.reason,
      status: item.status,
      submittedAt: item.submittedAt,
      reviewedAt: item.reviewedAt,
      reviewNote: item.reviewNote,
    };
  });
  return {
    userId: value.userId,
    partners,
    news,
    referrals,
    ...(value.next === undefined ? {} : { next: value.next }),
    ...(value.canReview === undefined ? {} : { canReview: value.canReview }),
  };
}
