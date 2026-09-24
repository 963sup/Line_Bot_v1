import { createHash, randomUUID } from "node:crypto";
import { readActiveUserQualification } from "@line-work/account/adapters/postgres";
import { businessDatabase, type Database, type Sql } from "@line-work/platform/adapters/postgres";
import type { PartnerCursor, PartnerRepository } from "../application/ports/partners.js";
import type {
  Partner,
  PartnerContact,
  PartnerNewsItem,
  PartnerReferral,
  PartnersView,
  PartnerView,
} from "../contracts.js";
import type { PartnerCommand } from "../domain.js";
import { normalizePartnerContact, partnerAssert } from "../domain.js";

export type PartnerPermissionCheck = (
  sql: Sql,
  actor: string,
  permission: "partners.manage" | "partners.review",
) => Promise<boolean>;

export class PostgresPartnerRepository implements PartnerRepository {
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
          : ((
              await sql.query(
                `SELECT p.id,p.name,p.category,p.region,p.status,p.version FROM partners p WHERE ($4::boolean OR (p.status='published'
            AND EXISTS (SELECT 1 FROM partner_contacts c WHERE c.partner_id=p.id AND c.status='published')))
            AND ($1::text IS NULL OR (p.name,p.id)>($1,$2::uuid)) ORDER BY p.name,p.id LIMIT $3`,
                [cursor?.name ?? null, cursor?.id ?? null, paginated ? 21 : null, managing],
              )
            ).rows as Omit<Partner, "contacts">[]);
      const hasMore = paginated && partners.length > 20;
      if (hasMore) partners.pop();
      const contacts =
        view && !paginated
          ? []
          : ((
              await sql.query(
                `SELECT id,partner_id AS "partnerId",name,responsibility,phone,email,line,status
        FROM partner_contacts WHERE ($2::boolean OR status='published') AND partner_id=ANY($1::uuid[]) ORDER BY partner_id,name,id`,
                [partners.map((partner) => partner.id), managing],
              )
            ).rows as PartnerContact[]);
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
          : ((
              await sql.query(
                `SELECT r.id AS "referralId",p.id AS "partnerId",c.id AS "contactId",
        p.name AS "partnerName",p.category,c.name AS "contactName",c.responsibility,r.reviewed_at AS "successfulAt"
        FROM partner_referrals r JOIN partners p ON p.id=r.partner_id JOIN partner_contacts c ON c.id=r.contact_id
        WHERE r.status='successful' AND p.status='published' AND c.status='published'
        ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 20`,
              )
            ).rows as PartnerNewsItem[]);
      const referrals =
        view && view !== "referrals"
          ? []
          : ((
              await sql.query(
                `SELECT id,partner_name AS "partnerName",category,region,contact_name AS "contactName",
        responsibility,method,value,reason,status,submitted_at AS "submittedAt",reviewed_at AS "reviewedAt",
        review_note AS "reviewNote" FROM partner_referrals WHERE submitter=$1 ORDER BY submitted_at DESC,id DESC LIMIT 50`,
                [userId],
              )
            ).rows as PartnerReferral[]);
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

  execute(userId: string, command: PartnerCommand, now: number) {
    if (command.action === "save-partner") return this.savePartner(userId, command, now);
    return this.db.transaction(async (sql) => {
      const user = await activeUser(sql, userId, this.permission);
      await sql.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${userId}:${command.requestId}`,
      ]);
      const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
      const old = (
        await sql.query(
          "SELECT result,fingerprint FROM partner_referral_commands WHERE actor=$1 AND request_id=$2",
          [userId, command.requestId],
        )
      ).rows[0];
      if (old) {
        partnerAssert(old.fingerprint === fingerprint, 409, "請求編號已用於不同內容。");
        return old.result as { id: string };
      }
      const result = await this.apply(sql, userId, user.canReview, command, now);
      await sql.query(
        "INSERT INTO partner_referral_commands(actor,request_id,fingerprint,result,action,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [userId, command.requestId, fingerprint, JSON.stringify(result), command.action, now],
      );
      return result;
    });
  }

  private savePartner(
    userId: string,
    command: Extract<PartnerCommand, { action: "save-partner" }>,
    now: number,
  ) {
    return this.db.transaction(async (sql) => {
      await sql.query("SELECT pg_advisory_xact_lock(hashtext('partner-directory'))");
      await activeUser(sql, userId, this.permission);
      partnerAssert(
        await this.permission(sql, userId, "partners.manage"),
        403,
        "需要合作夥伴管理權限。",
      );
      const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
      const old = (
        await sql.query(
          "SELECT fingerprint,result FROM partner_management_commands WHERE actor=$1 AND request_id=$2",
          [userId, command.requestId],
        )
      ).rows[0];
      if (old) {
        partnerAssert(old.fingerprint === fingerprint, 409, "請求編號已用於不同內容。");
        return old.result as { id: string };
      }
      const current = (
        await sql.query("SELECT version FROM partners WHERE id=$1 FOR UPDATE", [command.id])
      ).rows[0];
      partnerAssert(
        (current?.version ?? 0) === command.expectedVersion,
        409,
        "資料已更新，請重新讀取後再編輯。",
      );
      const existing = (
        await sql.query(
          "SELECT id,partner_id,phone,email,line FROM partner_contacts WHERE partner_id=$1 OR id=ANY($2::uuid[])",
          [command.id, command.contacts.map((c) => c.id)],
        )
      ).rows;
      partnerAssert(
        existing.every(
          (c) => c.partner_id === command.id && command.contacts.some((next) => next.id === c.id),
        ),
        409,
        "既有窗口不可刪除或移至其他夥伴，請改為下架。",
      );
      command = {
        ...command,
        contacts: command.contacts.map((contact) => {
          const previous = existing.find((row) => row.id === contact.id);
          return normalizePartnerContact(
            contact,
            previous
              ? { phone: previous.phone, email: previous.email, line: previous.line }
              : undefined,
          );
        }),
      };
      for (const c of command.contacts) {
        if (command.status === "published" && c.status === "published") {
          await rejectDuplicateContact(
            sql,
            command.name,
            c.name,
            c.phone,
            c.email,
            c.line,
            command.id,
          );
          partnerAssert(
            !command.contacts.some(
              (other) =>
                other.id !== c.id &&
                other.status === "published" &&
                other.name.trim().toLowerCase() === c.name.trim().toLowerCase() &&
                ((c.phone &&
                  other.phone.replace(/[\s()-]/g, "") === c.phone.replace(/[\s()-]/g, "")) ||
                  (c.email && other.email.trim().toLowerCase() === c.email.trim().toLowerCase()) ||
                  (c.line && other.line.toLowerCase() === c.line.toLowerCase())),
            ),
            409,
            "同名窗口與聯繫方式重複，請合併核對。",
          );
        }
      }
      const version = command.expectedVersion + 1;
      await sql.query(
        `INSERT INTO partners(id,name,category,region,status,created_at,created_by,version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,region=excluded.region,status=excluded.status,version=excluded.version`,
        [
          command.id,
          command.name,
          command.category,
          command.region,
          command.status,
          now,
          userId,
          version,
        ],
      );
      for (const c of command.contacts) {
        await sql.query(
          `INSERT INTO partner_contacts(id,partner_id,name,responsibility,phone,email,line,status,created_at,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=excluded.name,responsibility=excluded.responsibility,phone=excluded.phone,email=excluded.email,line=excluded.line,status=excluded.status`,
          [
            c.id,
            command.id,
            c.name,
            c.responsibility,
            c.phone,
            c.email,
            c.line,
            c.status,
            now,
            userId,
          ],
        );
      }
      partnerAssert(
        await this.permission(sql, userId, "partners.manage"),
        403,
        "合作夥伴管理權限已撤銷。",
      );
      const result = { id: command.id, version, at: now, requestId: command.requestId };
      await sql.query(
        `INSERT INTO partner_management_commands(actor,request_id,fingerprint,partner_id,previous_version,version,reason,consent_confirmed,result,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9)`,
        [
          userId,
          command.requestId,
          fingerprint,
          command.id,
          command.expectedVersion,
          version,
          command.reason,
          JSON.stringify(result),
          now,
        ],
      );
      return result;
    });
  }

  private async apply(
    sql: Sql,
    userId: string,
    canReview: boolean,
    command: Exclude<PartnerCommand, { action: "save-partner" }>,
    now: number,
  ) {
    if (command.action === "refer") {
      const id = randomUUID();
      await sql.query(
        `INSERT INTO partner_referrals
        (id,submitter,partner_name,category,region,contact_name,responsibility,method,value,reason,status,submitted_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)`,
        [
          id,
          userId,
          command.partnerName,
          command.category,
          command.region ?? "",
          command.contactName,
          command.responsibility,
          command.method,
          command.value,
          command.reason,
          now,
        ],
      );
      return { id };
    }
    const referral = (
      await sql.query("SELECT * FROM partner_referrals WHERE id=$1 FOR UPDATE", [
        command.referralId,
      ])
    ).rows[0];
    partnerAssert(referral, 404, "推薦案件不存在。");
    if (command.action === "withdraw") {
      partnerAssert(referral.submitter === userId, 403, "只能撤回自己的推薦。");
      partnerAssert(referral.status === "pending", 409, "推薦案件已結案。");
      await sql.query(
        "UPDATE partner_referrals SET status='withdrawn',reviewed_at=$2 WHERE id=$1",
        [command.referralId, now],
      );
      return { id: command.referralId };
    }
    partnerAssert(canReview, 403, "需要夥伴推薦審核權限。");
    partnerAssert(referral.status === "pending", 409, "推薦案件已結案。");
    if (command.status === "rejected") {
      await sql.query(
        "UPDATE partner_referrals SET status='rejected',reviewed_by=$2,reviewed_at=$3,review_note=$4 WHERE id=$1",
        [command.referralId, userId, now, command.reviewNote ?? ""],
      );
      return { id: command.referralId };
    }
    await sql.query("SELECT pg_advisory_xact_lock(hashtext('partner-directory'))");
    const phone = referral.method === "phone" ? referral.value : "";
    const email = referral.method === "email" ? referral.value : "";
    const line = referral.method === "line" ? referral.value : "";
    await rejectDuplicateContact(
      sql,
      referral.partner_name,
      referral.contact_name,
      phone,
      email,
      line,
    );
    const partnerId = randomUUID();
    const contactId = randomUUID();
    await sql.query(
      "INSERT INTO partners(id,name,category,region,status,created_at,created_by) VALUES($1,$2,$3,$4,'published',$5,$6)",
      [partnerId, referral.partner_name, referral.category, referral.region, now, userId],
    );
    await sql.query(
      `INSERT INTO partner_contacts(id,partner_id,name,responsibility,phone,email,line,status,created_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,'published',$8,$9)`,
      [
        contactId,
        partnerId,
        referral.contact_name,
        referral.responsibility,
        phone,
        email,
        line,
        now,
        userId,
      ],
    );
    await sql.query(
      `UPDATE partner_referrals SET status='successful',reviewed_by=$2,reviewed_at=$3,review_note=$4,
      partner_id=$5,contact_id=$6 WHERE id=$1`,
      [command.referralId, userId, now, command.reviewNote ?? "", partnerId, contactId],
    );
    return { id: command.referralId };
  }
}

async function rejectDuplicateContact(
  sql: Sql,
  partnerName: string,
  contactName: string,
  phone: string,
  email: string,
  line: string,
  exceptPartnerId?: string,
) {
  const duplicate = await sql.query(
    `SELECT 1 FROM partner_contacts c JOIN partners p ON p.id=c.partner_id
    WHERE p.status='published' AND c.status='published' AND ($6::uuid IS NULL OR p.id<>$6)
    AND lower(trim(p.name))=lower(trim($1)) AND lower(trim(c.name))=lower(trim($2))
    AND (($3<>'' AND regexp_replace(c.phone,'[[:space:]()-]','','g')=regexp_replace($3,'[[:space:]()-]','','g'))
      OR ($4<>'' AND lower(trim(c.email))=lower(trim($4))) OR ($5<>'' AND lower(trim(c.line))=lower(trim($5)))) LIMIT 1`,
    [partnerName, contactName, phone, email, line, exceptPartnerId ?? null],
  );
  partnerAssert(!duplicate.rows.length, 409, "同名夥伴的窗口與聯繫方式已存在，請核對既有資料。");
}

async function activeUser(sql: Sql, userId: string, permission: PartnerPermissionCheck) {
  const user = await readActiveUserQualification(sql, userId, "share");
  partnerAssert(user, 403, "LINE 會員資格已失效，請重新確認。");
  return {
    id: user.id,
    canReview: await permission(sql, userId, "partners.review"),
  };
}
