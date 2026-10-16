export class PartnerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function partnerAssert(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new PartnerError(status, message);
}

export type ContactMethod = "phone" | "email" | "line";
export type PartnerContactDraft = {
  id: string;
  name: string;
  responsibility: string;
  phone: string;
  email: string;
  line: string;
  status: "published" | "unlisted";
};

export type PartnerSaveDraft = {
  id: string;
  expectedVersion: number;
  name: string;
  category: string;
  region: string;
  status: "published" | "unlisted";
  contacts: PartnerContactDraft[];
};

export type StoredPartnerContact = {
  id: string;
  partnerId: string;
  phone: string;
  email: string;
  line: string;
};

export type PartnerReferralState = {
  submitter: string;
  status: "pending" | "successful" | "rejected" | "withdrawn";
  method: ContactMethod;
  value: string;
  partnerName: string;
  category: string;
  region: string;
  contactName: string;
  responsibility: string;
};

export function partnerContactHref(method: ContactMethod, value: string): string | null {
  if (!value) return null;
  if (method === "phone")
    return /^\+?[0-9 ()-]{3,40}$/.test(value) ? `tel:${value.replace(/[ ()-]/g, "")}` : null;
  if (method === "email")
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[?#%]/.test(value)
      ? `mailto:${value}`
      : null;
  try {
    const url = new URL(value);
    if (url.username || url.password || /[\s<>]/.test(value)) return null;
    if (url.protocol === "https:" && !url.port && ["line.me", "lin.ee"].includes(url.hostname))
      return url.href;
    if (url.protocol === "line:" && url.hostname === "ti" && url.pathname.startsWith("/p/"))
      return url.href;
  } catch {
    /* A LINE search ID is copyable text, not a URL. */
  }
  return null;
}

export function normalizePartnerContactValue(kind: ContactMethod, value: string) {
  if (!value) return "";
  partnerAssert(
    Boolean(partnerContactHref(kind, value)) ||
      (kind === "line" && /^[a-zA-Z0-9._-]{1,160}$/.test(value)),
    400,
    "請核對電話、Email 或 LINE 聯繫方式。",
  );
  return kind === "phone"
    ? value.replace(/[ ()-]/g, "")
    : kind === "email"
      ? value.toLowerCase()
      : value;
}

/** Only the repository can supply a trusted previous contact for preserving legacy values. */
function normalizePartnerContact(
  contact: PartnerContactDraft,
  previous?: { phone: string; email: string; line: string },
) {
  const normalize = (kind: ContactMethod) =>
    previous && contact[kind] === previous[kind].trim()
      ? previous[kind]
      : normalizePartnerContactValue(kind, contact[kind]);
  return {
    ...contact,
    phone: normalize("phone"),
    email: normalize("email"),
    line: normalize("line"),
  };
}

/** Decide a directory edit from current version and the complete persisted contact set. */
export function preparePartnerSave(
  command: PartnerSaveDraft,
  currentVersion: number | null,
  existing: readonly StoredPartnerContact[],
): PartnerSaveDraft & { version: number } {
  partnerAssert(
    (currentVersion ?? 0) === command.expectedVersion,
    409,
    "資料已更新，請重新讀取後再編輯。",
  );
  partnerAssert(
    existing.every(
      (saved) =>
        saved.partnerId === command.id && command.contacts.some((next) => next.id === saved.id),
    ),
    409,
    "既有窗口不可刪除或移至其他夥伴，請改為下架。",
  );
  const contacts = command.contacts.map((contact) => {
    const previous = existing.find((saved) => saved.id === contact.id);
    return normalizePartnerContact(
      contact,
      previous
        ? { phone: previous.phone, email: previous.email, line: previous.line }
        : undefined,
    );
  });
  for (const contact of contacts) {
    if (command.status !== "published" || contact.status !== "published") continue;
    partnerAssert(
      !contacts.some(
        (other) =>
          other.id !== contact.id &&
          other.status === "published" &&
          other.name.trim().toLowerCase() === contact.name.trim().toLowerCase() &&
          ((contact.phone &&
            other.phone.replace(/[\s()-]/g, "") === contact.phone.replace(/[\s()-]/g, "")) ||
            (contact.email &&
              other.email.trim().toLowerCase() === contact.email.trim().toLowerCase()) ||
            (contact.line && other.line.toLowerCase() === contact.line.toLowerCase())),
      ),
      409,
      "同名窗口與聯繫方式重複，請合併核對。",
    );
  }
  return { ...command, contacts, version: command.expectedVersion + 1 };
}

/** Return the only legal referral transition; SQL may enforce it atomically but not decide it. */
export function decidePartnerReferral(
  command: { action: "withdraw" } | { action: "review"; status: "successful" | "rejected" },
  referral: Pick<PartnerReferralState, "submitter" | "status">,
  actor: string,
  canReview: boolean,
): "withdrawn" | "rejected" | "successful" {
  if (command.action === "withdraw") {
    partnerAssert(referral.submitter === actor, 403, "只能撤回自己的推薦。");
    partnerAssert(referral.status === "pending", 409, "推薦案件已結案。");
    return "withdrawn";
  }
  partnerAssert(canReview, 403, "需要夥伴推薦審核權限。");
  partnerAssert(referral.status === "pending", 409, "推薦案件已結案。");
  return command.status;
}

/** Persisted conflict detection stays in the adapter; its meaning belongs to Partners. */
export function assertUniquePartnerContact(duplicate: boolean): void {
  partnerAssert(!duplicate, 409, "同名夥伴的窗口與聯繫方式已存在，請核對既有資料。");
}
