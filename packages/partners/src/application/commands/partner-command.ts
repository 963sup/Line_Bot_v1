import {
  PartnerError,
  partnerAssert,
  normalizePartnerContactValue,
  type ContactMethod,
  type PartnerContactDraft,
} from "../../domain.js";

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

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
      contacts: PartnerContactDraft[];
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


function status(value: unknown): "published" | "unlisted" {
  partnerAssert(value === "published" || value === "unlisted", 400, "刊登狀態不正確。");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new PartnerError(400, message);
  return value;
}

function nonnegativeInteger(value: unknown): number {
  partnerAssert(
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    400,
    "版本不正確。",
  );
  return value;
}

export function parsePartnerCommand(input: unknown): PartnerCommand {
  const x = record(input, "資料格式錯誤。");
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
    partnerAssert(uuid(id), 400, "夥伴編號或版本不正確。");
    const expectedVersion = nonnegativeInteger(x.expectedVersion);
    partnerAssert(x.consentConfirmed === true, 400, "請確認已核實聯繫方式與分享同意。");
    partnerAssert(
      Array.isArray(x.contacts) && x.contacts.length > 0 && x.contacts.length <= 20,
      400,
      "每個夥伴需有 1 至 20 位窗口。",
    );
    const contacts = x.contacts.map((raw) => {
      const c = record(raw, "窗口格式不正確。");
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
      expectedVersion,
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
      value: normalizePartnerContactValue(method(x.method), text(x, "value", 160)),
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
