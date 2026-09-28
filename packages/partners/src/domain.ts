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

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
type ContactMethod = "phone" | "email" | "line";
export type PartnerCommand =
  | {
      action: "save-partner";
      requestId: string;
      id: string;
      expectedVersion: number;
      name: string;
      category: string;
      region: string;
      status: "published" | "unlisted";
      contacts: {
        id: string;
        name: string;
        responsibility: string;
        phone: string;
        email: string;
        line: string;
        status: "published" | "unlisted";
      }[];
      consentConfirmed: true;
      reason: string;
    }
  | {
      action: "refer";
      requestId: string;
      partnerName: string;
      category: string;
      region?: string;
      contactName: string;
      responsibility: string;
      method: ContactMethod;
      value: string;
      reason: string;
    }
  | {
      action: "review";
      requestId: string;
      referralId: string;
      status: "successful" | "rejected";
      reviewNote?: string;
    }
  | { action: "withdraw"; requestId: string; referralId: string };

function text(source: Record<string, unknown>, key: string, max: number, required = true) {
  const value = source[key] ?? "";
  partnerAssert(
    typeof value === "string" && value.length <= max && (!required || value.trim().length > 0),
    400,
    `請核對 ${key} 欄位。`,
  );
  return value.trim();
}

function method(value: unknown): ContactMethod {
  partnerAssert(value === "phone" || value === "email" || value === "line", 400, "聯繫方式無效。");
  return value;
}

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

function contactValue(kind: ContactMethod, value: string) {
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
export function normalizePartnerContact(
  contact: Extract<PartnerCommand, { action: "save-partner" }>["contacts"][number],
  previous?: { phone: string; email: string; line: string },
) {
  const normalize = (kind: ContactMethod) =>
    previous && contact[kind] === previous[kind].trim()
      ? previous[kind]
      : contactValue(kind, contact[kind]);
  return {
    ...contact,
    phone: normalize("phone"),
    email: normalize("email"),
    line: normalize("line"),
  };
}

function status(value: unknown): "published" | "unlisted" {
  partnerAssert(value === "published" || value === "unlisted", 400, "刊登狀態不正確。");
  return value;
}

export function parsePartnerCommand(input: unknown): PartnerCommand {
  partnerAssert(input && typeof input === "object" && !Array.isArray(input), 400, "資料格式錯誤。");
  const x = input as Record<string, unknown>;
  partnerAssert(
    x.action === "refer" ||
      x.action === "review" ||
      x.action === "withdraw" ||
      x.action === "save-partner",
    400,
    "不支援的夥伴操作。",
  );
  const requestId = text(x, "requestId", 36).toLowerCase();
  partnerAssert(uuid(requestId), 400, "請求編號無效。");
  if (x.action === "save-partner") {
    const allowed = [
      "action",
      "requestId",
      "id",
      "expectedVersion",
      "name",
      "category",
      "region",
      "status",
      "contacts",
      "consentConfirmed",
      "reason",
    ];
    partnerAssert(
      Object.keys(x).every((key) => allowed.includes(key)),
      400,
      "包含不支援的管理欄位。",
    );
    const id = text(x, "id", 36).toLowerCase();
    partnerAssert(
      uuid(id) && Number.isSafeInteger(x.expectedVersion) && (x.expectedVersion as number) >= 0,
      400,
      "夥伴編號或版本不正確。",
    );
    partnerAssert(x.consentConfirmed === true, 400, "請確認已核實聯繫方式與分享同意。");
    partnerAssert(
      Array.isArray(x.contacts) && x.contacts.length > 0 && x.contacts.length <= 20,
      400,
      "每個夥伴需有 1 至 20 位窗口。",
    );
    const contacts = x.contacts.map((raw) => {
      partnerAssert(raw && typeof raw === "object" && !Array.isArray(raw), 400, "窗口格式不正確。");
      const c = raw as Record<string, unknown>;
      partnerAssert(
        Object.keys(c).every((key) =>
          ["id", "name", "responsibility", "phone", "email", "line", "status"].includes(key),
        ),
        400,
        "窗口包含不支援欄位。",
      );
      const contactId = text(c, "id", 36).toLowerCase();
      partnerAssert(uuid(contactId), 400, "窗口編號不正確。");
      // Format validation needs the stored contact to distinguish unchanged legacy values.
      const phone = text(c, "phone", 160, false);
      const email = text(c, "email", 160, false);
      const line = text(c, "line", 160, false);
      partnerAssert(phone || email || line, 400, "每位窗口至少填一種聯繫方式。");
      return {
        id: contactId,
        name: text(c, "name", 80),
        responsibility: text(c, "responsibility", 160),
        phone,
        email,
        line,
        status: status(c.status),
      };
    });
    partnerAssert(
      new Set(contacts.map((c) => c.id)).size === contacts.length,
      400,
      "窗口編號重複。",
    );
    const nextStatus = status(x.status);
    partnerAssert(
      nextStatus !== "published" || contacts.some((c) => c.status === "published"),
      400,
      "刊登夥伴至少需有一位有效窗口。",
    );
    return {
      action: "save-partner",
      requestId,
      id,
      expectedVersion: x.expectedVersion as number,
      name: text(x, "name", 120),
      category: text(x, "category", 80),
      region: text(x, "region", 80, false),
      status: nextStatus,
      contacts,
      consentConfirmed: true,
      reason: text(x, "reason", 500),
    };
  }
  if (x.action === "refer")
    return {
      action: "refer",
      requestId,
      partnerName: text(x, "partnerName", 120),
      category: text(x, "category", 80),
      region: text(x, "region", 80, false),
      contactName: text(x, "contactName", 80),
      responsibility: text(x, "responsibility", 160),
      method: method(x.method),
      value: contactValue(method(x.method), text(x, "value", 160)),
      reason: text(x, "reason", 500),
    };
  const referralId = text(x, "referralId", 36).toLowerCase();
  partnerAssert(uuid(referralId), 400, "推薦案件無效。");
  if (x.action === "withdraw") return { action: "withdraw", requestId, referralId };
  partnerAssert(x.status === "successful" || x.status === "rejected", 400, "審核結果無效。");
  return {
    action: "review",
    requestId,
    referralId,
    status: x.status,
    reviewNote: text(x, "reviewNote", 500, false),
  };
}
