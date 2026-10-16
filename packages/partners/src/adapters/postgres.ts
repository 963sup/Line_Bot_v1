import { createHash, randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line_bot_v1/account/postgres";
import { businessDatabase, type Database, type Sql } from "@line_bot_v1/platform/postgres";
import {
  literalValue,
  nullableNumericValue,
  numericValue,
  record,
  stringValue,
} from "@line_bot_v1/platform/validation";
import type { PartnerCursor, PartnerRepository } from "../contracts/repositories/partners.js";
import type {
  PartnerMutationTransactions,
  PartnerMutationRequest,
  PartnerMutationTransaction,
  PartnerReceipt,
  PartnerPublishedContact,
} from "../contracts/output/partner-mutations.js";
import type {
  Partner,
  PartnerContact,
  PartnerNewsItem,
  PartnerReferral,
  PartnersView,
  PartnerView,
} from "../contracts.js";
import type { PartnerReferralState, StoredPartnerContact } from "../domain.js";
import { partnerAssert } from "../domain.js";

type PartnerPermissionCheck = (
  sql: Sql,
  actor: string,
  permission: "partners.manage" | "partners.review",
) => Promise<boolean>;

const partnerStatuses = ["published", "unlisted"] as const;
const contactMethods = ["phone", "email", "line"] as const;
const referralStatuses = ["pending", "successful", "rejected", "withdrawn"] as const;

function integer(value: unknown): number {
  const result = Number(numericValue(value));
  if (!Number.isSafeInteger(result)) throw new TypeError("Expected a safe integer");
  return result;
}

function nullableInteger(value: unknown): number | null {
  const result = nullableNumericValue(value);
  return result === null ? null : integer(result);
}

function decodePartner(row: Record<string, unknown>): Omit<Partner, "contacts"> {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    category: stringValue(row.category),
    region: stringValue(row.region),
    status: literalValue(row.status, partnerStatuses),
    version: integer(row.version),
  };
}

function decodeContact(row: Record<string, unknown>): PartnerContact {
  return {
    id: stringValue(row.id),
    partnerId: stringValue(row.partnerId),
    name: stringValue(row.name),
    responsibility: stringValue(row.responsibility),
    phone: stringValue(row.phone),
    email: stringValue(row.email),
    line: stringValue(row.line),
    status: literalValue(row.status, partnerStatuses),
  };
}

function decodeNews(row: Record<string, unknown>): PartnerNewsItem {
  return {
    referralId: stringValue(row.referralId),
    partnerId: stringValue(row.partnerId),
    contactId: stringValue(row.contactId),
    partnerName: stringValue(row.partnerName),
    category: stringValue(row.category),
    contactName: stringValue(row.contactName),
    responsibility: stringValue(row.responsibility),
    successfulAt: integer(row.successfulAt),
  };
}

function decodeReferral(row: Record<string, unknown>): PartnerReferral {
  return {
    id: stringValue(row.id),
    partnerName: stringValue(row.partnerName),
    category: stringValue(row.category),
    region: stringValue(row.region),
    contactName: stringValue(row.contactName),
    responsibility: stringValue(row.responsibility),
    method: literalValue(row.method, contactMethods),
    value: stringValue(row.value),
    reason: stringValue(row.reason),
    status: literalValue(row.status, referralStatuses),
    submittedAt: integer(row.submittedAt),
    reviewedAt: nullableInteger(row.reviewedAt),
    reviewNote: stringValue(row.reviewNote),
  };
}

function decodeResult(value: unknown): Record<string, unknown> & { id: string } {
  const result = record(value);
  return { ...result, id: stringValue(result.id) };
}

function decodeReceipt(row: Record<string, unknown>) {
  return { fingerprint: stringValue(row.fingerprint), result: decodeResult(row.result) };
}

function decodeVersion(row: Record<string, unknown>) {
  return { version: integer(row.version) };
}

function decodeStoredPartnerContact(row: Record<string, unknown>): StoredPartnerContact {
  return {
    id: stringValue(row.id),
    partnerId: stringValue(row.partner_id),
    phone: stringValue(row.phone),
    email: stringValue(row.email),
    line: stringValue(row.line),
  };
}

function decodePartnerReferralState(row: Record<string, unknown>): PartnerReferralState {
  return {
    submitter: stringValue(row.submitter),
    status: literalValue(row.status, referralStatuses),
    method: literalValue(row.method, contactMethods),
    value: stringValue(row.value),
    partnerName: stringValue(row.partner_name),
    category: stringValue(row.category),
    region: stringValue(row.region),
    contactName: stringValue(row.contact_name),
    responsibility: stringValue(row.responsibility),
  };
}

export class PostgresPartnerRepository implements PartnerRepository, PartnerMutationTransactions {
  constructor(
    private readonly permission: PartnerPermissionCheck,
    private db: Database = businessDatabase(),
  ) {}

  async view(userId: string, view?: PartnerView, cursor?: PartnerCursor): Promise<PartnersView> {
    return this.db.transaction(async (sql) => {
      if (view === "manage") await sql.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const user = await activeUser(sql, userId, this.permission);
      const managing = view === "manage";
      const paginated = view === "directory" || managing;
      if (managing) {
        partnerAssert(
          await this.permission(sql, userId, "partners.manage"),
          403,
          "需要合作夥伴管理權限。",
        );
      }
      const partners =
        view && !paginated
          ? []
          : (
              await sql.query(
                `SELECT p.id,p.name,p.category,p.region,p.status,p.version FROM partners p WHERE ($4::boolean OR (p.status='published'
            AND EXISTS (SELECT 1 FROM partner_contacts c WHERE c.partner_id=p.id AND c.status='published')))
            AND ($1::text IS NULL OR (p.name,p.id)>($1,$2::uuid)) ORDER BY p.name,p.id LIMIT $3`,
                [cursor?.name ?? null, cursor?.id ?? null, paginated ? 21 : null, managing],
                decodePartner,
              )
            ).rows;
      const hasMore = paginated && partners.length > 20;
      if (hasMore) partners.pop();
      const contacts =
        view && !paginated
          ? []
          : (
              await sql.query(
                `SELECT id,partner_id AS "partnerId",name,responsibility,phone,email,line,status
        FROM partner_contacts WHERE ($2::boolean OR status='published') AND partner_id=ANY($1::uuid[]) ORDER BY partner_id,name,id`,
                [partners.map((partner) => partner.id), managing],
                decodeContact,
              )
            ).rows;
      const byPartner = new Map<string, PartnerContact[]>();
      for (const contact of contacts) {
        byPartner.set(contact.partnerId, [...(byPartner.get(contact.partnerId) ?? []), contact]);
      }
      const visible = partners
        .map((partner) => ({ ...partner, contacts: byPartner.get(partner.id) ?? [] }))
        .filter((partner) => managing || partner.contacts.length);
      const news =
        view && view !== "news"
          ? []
          : (
              await sql.query(
                `SELECT r.id AS "referralId",p.id AS "partnerId",c.id AS "contactId",
        p.name AS "partnerName",p.category,c.name AS "contactName",c.responsibility,r.reviewed_at AS "successfulAt"
        FROM partner_referrals r JOIN partners p ON p.id=r.partner_id JOIN partner_contacts c ON c.id=r.contact_id
                WHERE r.status='successful' AND p.status='published' AND c.status='published'
        ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 20`,
                undefined,
                decodeNews,
              )
            ).rows;
      const referrals =
        view && view !== "referrals"
          ? []
          : (
              await sql.query(
                `SELECT id,partner_name AS "partnerName",category,region,contact_name AS "contactName",
        responsibility,method,value,reason,status,submitted_at AS "submittedAt",reviewed_at AS "reviewedAt",
        review_note AS "reviewNote" FROM partner_referrals WHERE submitter=$1 ORDER BY submitted_at DESC,id DESC LIMIT 50`,
                [userId],
                decodeReferral,
              )
            ).rows;
      const last = partners.at(-1);
      return {
        userId,
        partners: visible,
        news,
        referrals,
        ...(!managing ? { canReview: user.canReview } : {}),
        ...(paginated
          ? { next: hasMore && last ? JSON.stringify({ name: last.name, id: last.id }) : null }
          : {}),
      };
    });
  }

  run<T extends PartnerReceipt>(
    userId: string,
    request: PartnerMutationRequest,
    work: (transaction: PartnerMutationTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (sql) => {
      if (request.kind === "management") {
        await sql.query("SELECT pg_advisory_xact_lock(hashtext('partner-directory'))");
      }
      const user = await activeUser(sql, userId, this.permission);
      if (request.kind === "referral") {
        await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `${userId}:${request.requestId}`,
        ]);
      }
      const fingerprint = createHash("sha256").update(request.payload).digest("hex");
      const receiptTable =
        request.kind === "management" ? "partner_management_commands" : "partner_referral_commands";

      const transaction: PartnerMutationTransaction = {
        canReview: user.canReview,
        canManage: () => this.permission(sql, userId, "partners.manage"),
        async replay() {
          const old = (
            await sql.query(
              `SELECT result,fingerprint FROM ${receiptTable} WHERE actor=$1 AND request_id=$2`,
              [userId, request.requestId],
              decodeReceipt,
            )
          ).rows[0];
          if (!old) return null;
          partnerAssert(old.fingerprint === fingerprint, 409, "請求編號已用於不同內容。");
          return old.result;
        },
        async record(result) {
          if (request.kind === "management") {
            if (typeof result.version !== "number") throw new Error("Missing Partner version");
            await sql.query(
              `INSERT INTO partner_management_commands(actor,request_id,fingerprint,partner_id,previous_version,version,reason,consent_confirmed,result,created_at)
              VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9)`,
              [
                userId,
                request.requestId,
                fingerprint,
                request.partnerId,
                request.previousVersion,
                result.version,
                request.reason,
                JSON.stringify(result),
                request.at,
              ],
            );
          } else {
            await sql.query(
              "INSERT INTO partner_referral_commands(actor,request_id,fingerprint,result,action,created_at) VALUES($1,$2,$3,$4,$5,$6)",
              [userId, request.requestId, fingerprint, JSON.stringify(result), request.action, request.at],
            );
          }
        },
        async partnerVersion(id) {
          const row = (
            await sql.query("SELECT version FROM partners WHERE id=$1 FOR UPDATE", [id], decodeVersion)
          ).rows[0];
          return row?.version ?? null;
        },
        async existingContacts(id, contactIds) {
          return (
            await sql.query(
              "SELECT id,partner_id,phone,email,line FROM partner_contacts WHERE partner_id=$1 OR id=ANY($2::uuid[])",
              [id, contactIds],
              decodeStoredPartnerContact,
            )
          ).rows;
        },
        duplicateContact: (contact) => duplicatePartnerContact(sql, contact),
        async lockDirectory() {
          await sql.query("SELECT pg_advisory_xact_lock(hashtext('partner-directory'))");
        },
        async savePartner(next) {
          await sql.query(
            `INSERT INTO partners(id,name,category,region,status,created_at,created_by,version)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,region=excluded.region,status=excluded.status,version=excluded.version`,
            [next.id, next.name, next.category, next.region, next.status, request.at, userId, next.version],
          );
          for (const contact of next.contacts) {
            await sql.query(
              `INSERT INTO partner_contacts(id,partner_id,name,responsibility,phone,email,line,status,created_at,created_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=excluded.name,responsibility=excluded.responsibility,phone=excluded.phone,email=excluded.email,line=excluded.line,status=excluded.status`,
              [
                contact.id, next.id, contact.name, contact.responsibility,
                contact.phone, contact.email, contact.line, contact.status, request.at, userId,
              ],
            );
          }
        },
        async refer(input) {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO partner_referrals
            (id,submitter,partner_name,category,region,contact_name,responsibility,method,value,reason,status,submitted_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)`,
            [
              id, userId, input.partnerName, input.category, input.region ?? "",
              input.contactName, input.responsibility, input.method, input.value, input.reason, request.at,
            ],
          );
          return id;
        },
        async referral(id) {
          return (
            await sql.query(
              "SELECT * FROM partner_referrals WHERE id=$1 FOR UPDATE",
              [id],
              decodePartnerReferralState,
            )
          ).rows[0] ?? null;
        },
        async withdraw(id) {
          await sql.query(
            "UPDATE partner_referrals SET status='withdrawn',reviewed_at=$2 WHERE id=$1",
            [id, request.at],
          );
        },
        async reject(id, note) {
          await sql.query(
            "UPDATE partner_referrals SET status='rejected',reviewed_by=$2,reviewed_at=$3,review_note=$4 WHERE id=$1",
            [id, userId, request.at, note],
          );
        },
        async publish(id, referral, note) {
          const partnerId = randomUUID();
          const contactId = randomUUID();
          await sql.query(
            "INSERT INTO partners(id,name,category,region,status,created_at,created_by) VALUES($1,$2,$3,$4,'published',$5,$6)",
            [partnerId, referral.partnerName, referral.category, referral.region, request.at, userId],
          );
          await sql.query(
            `INSERT INTO partner_contacts(id,partner_id,name,responsibility,phone,email,line,status,created_at,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,'published',$8,$9)`,
            [
              contactId, partnerId, referral.contactName, referral.responsibility,
              referral.method === "phone" ? referral.value : "",
              referral.method === "email" ? referral.value : "",
              referral.method === "line" ? referral.value : "",
              request.at, userId,
            ],
          );
          await sql.query(
            `UPDATE partner_referrals SET status='successful',reviewed_by=$2,reviewed_at=$3,review_note=$4,
             partner_id=$5,contact_id=$6 WHERE id=$1`,
            [id, userId, request.at, note, partnerId, contactId],
          );
        },
      };
      return work(transaction);
    });
  }
}

async function duplicatePartnerContact(sql: Sql, contact: PartnerPublishedContact): Promise<boolean> {
  const { partnerName, contactName, phone, email, line, exceptPartnerId } = contact;
  const duplicate = await sql.query(
    `SELECT 1 FROM partner_contacts c JOIN partners p ON p.id=c.partner_id
    WHERE p.status='published' AND c.status='published' AND ($6::uuid IS NULL OR p.id<>$6)
    AND lower(trim(p.name))=lower(trim($1)) AND lower(trim(c.name))=lower(trim($2))
    AND (($3<>'' AND regexp_replace(c.phone,'[[:space:]()-]','','g')=regexp_replace($3,'[[:space:]()-]','','g'))
      OR ($4<>'' AND lower(trim(c.email))=lower(trim($4))) OR ($5<>'' AND lower(trim(c.line))=lower(trim($5)))) LIMIT 1`,
    [partnerName, contactName, phone, email, line, exceptPartnerId ?? null],
  );
  return duplicate.rows.length > 0;
}

async function activeUser(sql: Sql, userId: string, permission: PartnerPermissionCheck) {
  const user = await readActiveUserQualification(sql, userId, "share");
  partnerAssert(user, 403, "LINE 會員資格已失效，請重新確認。");
  return {
    id: user.id,
    canReview: await permission(sql, userId, "partners.review"),
  };
}
