import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { postgresFixture } from "@line_bot_v1/platform/testing/postgres";
import { createPartners } from "../src/application/partners.js";
import { PostgresPartnerRepository } from "../src/adapters/postgres.js";
import { PartnerError } from "../src/domain.js";

test("Partner writes retain atomic referral publication and exact replay in PostgreSQL", async (t) => {
  const { pg, db } = await postgresFixture();
  t.after(() => pg.close());
  await db.transaction(async (sql) => {
    await sql.query(
      "INSERT INTO users(id,status,status_version,\"createdAt\") VALUES('owner','active',1,1)",
    );
  });
  let now = 100;
  let managing = true;
  let reviewing = true;
  const repository = new PostgresPartnerRepository(
    async (_sql, actor, permission) => {
      assert.equal(actor, "owner");
      return permission === "partners.manage" ? managing : reviewing;
    },
    db,
  );
  const partners = createPartners({
    activeUser: async () => ({ id: "owner" }),
    repository: () => repository,
    mutations: () => repository,
    now: () => now,
  });

  const refer = {
    action: "refer",
    requestId: randomUUID(),
    partnerName: "東區設備",
    category: "設備",
    contactName: "窗口",
    responsibility: "聯繫",
    method: "phone",
    value: "0212345678",
    reason: "推薦合作夥伴",
  };
  const submitted = await partners.execute("proof", refer);
  const pending = await pg.query(
    "SELECT status,submitted_at FROM app_private.partner_referrals WHERE id=$1",
    [submitted.id],
  );
  assert.equal(pending.rows[0]?.status, "pending");
  assert.equal(Number(pending.rows[0]?.submitted_at), 100);
  now = 101;
  assert.deepEqual(await partners.execute("proof", refer), submitted);

  const review = {
    action: "review",
    requestId: randomUUID(),
    referralId: submitted.id,
    status: "successful",
    reviewNote: "已確認",
  };
  const accepted = await partners.execute("proof", review);
  assert.deepEqual(accepted, { id: submitted.id });
  const persisted = await pg.query(
    `SELECT r.status,r.partner_id,r.contact_id,r.submitted_at,
            p.name AS partner_name,c.name AS contact_name
     FROM app_private.partner_referrals r
     JOIN app_private.partners p ON p.id=r.partner_id
     JOIN app_private.partner_contacts c ON c.id=r.contact_id
     WHERE r.id=$1`,
    [submitted.id],
  );
  assert.deepEqual(
    [
      persisted.rows[0]?.status,
      persisted.rows[0]?.partner_name,
      persisted.rows[0]?.contact_name,
    ],
    ["successful", "東區設備", "窗口"],
  );
  assert.equal(Number(persisted.rows[0]?.submitted_at), 100);
  now = 102;
  assert.deepEqual(await partners.execute("proof", review), accepted);
  assert.equal(
    (await pg.query("SELECT count(*)::int AS count FROM app_private.partners")).rows[0]?.count,
    1,
  );
  await assert.rejects(
    partners.execute("proof", { ...review, status: "rejected" }),
    (error: unknown) => error instanceof PartnerError && error.status === 409,
  );

  const save = {
    action: "save-partner",
    requestId: randomUUID(),
    id: randomUUID(),
    expectedVersion: 0,
    name: "另一夥伴",
    category: "設備",
    region: "",
    status: "published",
    contacts: [
      {
        id: randomUUID(),
        name: "新窗口",
        responsibility: "聯絡",
        phone: "031234567",
        email: "",
        line: "",
        status: "published",
      },
    ],
    consentConfirmed: true,
    reason: "已確認窗口同意",
  };
  const saved = await partners.execute("proof", save);
  assert.equal(saved.version, 1);
  now = 103;
  assert.deepEqual(await partners.execute("proof", save), saved);
  managing = false;
  await assert.rejects(
    partners.execute("proof", save),
    (error: unknown) => error instanceof PartnerError && error.status === 403,
  );
  reviewing = false;
  await assert.rejects(
    partners.execute("proof", { ...review, requestId: randomUUID() }),
    (error: unknown) => error instanceof PartnerError && error.status === 403,
  );
});
