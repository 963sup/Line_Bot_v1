import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { parsePartnerCommand } from "../src/application/commands/partner-command.js";
import {
  assertUniquePartnerContact,
  decidePartnerReferral,
  type PartnerContactDraft,
  PartnerError,
  partnerContactHref,
  preparePartnerSave,
} from "../src/domain.js";

test("email contact links validate address structure and reject link injection", () => {
  for (const value of ["person@example.com", "person+tag@sub.example.com"])
    assert.equal(partnerContactHref("email", value), `mailto:${value}`);
  for (const value of [
    "@example.com",
    "person@example",
    "person@.com",
    "person@example.",
    "person@@example.com",
    "person @example.com",
    "person@example.com\n",
    "person@example.com?subject=test",
    "person@example.com#fragment",
    "person%0a@example.com",
    "<person@example.com>",
  ])
    assert.equal(partnerContactHref("email", value), null);
});

test("email contact validation completes on long attacker-controlled domain segments", () => {
  const domain = new URL("../src/domain.ts", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      "--input-type=module",
      "--eval",
      `import assert from "node:assert/strict";
       const { partnerContactHref } = await import(${JSON.stringify(domain)});
       assert.equal(partnerContactHref("email", "!@!." + "!.".repeat(100000) + " "), null);`,
    ],
    { timeout: 5000, encoding: "utf8" },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});

function fails(fn: () => unknown, status: number) {
  assert.throws(fn, (error: unknown) => error instanceof PartnerError && error.status === status);
}

const contact = (id = randomUUID()): PartnerContactDraft => ({
  id,
  name: "窗口",
  responsibility: "聯絡",
  phone: "02 1234-5678",
  email: "",
  line: "",
  status: "published",
});

test("partner save enforces version, retains historical contacts and normalizes actual updates", () => {
  const id = randomUUID(),
    old = contact();
  const command = {
    id,
    expectedVersion: 1,
    name: "夥伴",
    category: "設備",
    region: "",
    status: "published" as const,
    contacts: [old],
  };
  const previous = [{ id: old.id, partnerId: id, phone: "legacy-phone", email: "", line: "" }];
  const unchanged = preparePartnerSave(
    { ...command, contacts: [{ ...old, phone: "legacy-phone" }] },
    1,
    previous,
  );
  assert.equal(unchanged.version, 2);
  assert.equal(unchanged.contacts[0]?.phone, "legacy-phone");
  const normalized = preparePartnerSave(command, 1, previous);
  assert.equal(normalized.contacts[0]?.phone, "0212345678");
  fails(() => preparePartnerSave(command, 2, previous), 409);
  fails(() => preparePartnerSave(command, 1, [{ ...previous[0], id: randomUUID() }]), 409);
  fails(() => preparePartnerSave(command, 1, [{ ...previous[0], partnerId: randomUUID() }]), 409);
});

test("published contact uniqueness rejects duplicate current contacts and persisted conflicts", () => {
  const id = randomUUID(),
    c = contact();
  const command = {
    id,
    expectedVersion: 0,
    name: "同名",
    category: "設備",
    region: "",
    status: "published" as const,
    contacts: [c, { ...c, id: randomUUID(), phone: "0212345678" }],
  };
  fails(() => preparePartnerSave(command, null, []), 409);
  fails(() => assertUniquePartnerContact(true), 409);
  assert.doesNotThrow(() => assertUniquePartnerContact(false));
});

test("referrals have independent submitter withdrawal and reviewer terminal transitions", () => {
  const referral = { submitter: "author", status: "pending" as const };
  assert.equal(
    decidePartnerReferral({ action: "withdraw" }, referral, "author", false),
    "withdrawn",
  );
  fails(() => decidePartnerReferral({ action: "withdraw" }, referral, "outsider", true), 403);
  fails(
    () =>
      decidePartnerReferral({ action: "review", status: "successful" }, referral, "author", false),
    403,
  );
  assert.equal(
    decidePartnerReferral({ action: "review", status: "successful" }, referral, "reviewer", true),
    "successful",
  );
  assert.equal(
    decidePartnerReferral({ action: "review", status: "rejected" }, referral, "reviewer", true),
    "rejected",
  );
  fails(
    () =>
      decidePartnerReferral(
        { action: "review", status: "successful" },
        { ...referral, status: "withdrawn" },
        "reviewer",
        true,
      ),
    409,
  );
});

test("application parser still rejects invalid request identity, extra fields and missing consent", () => {
  const raw = {
    action: "save-partner",
    requestId: randomUUID(),
    id: randomUUID(),
    expectedVersion: 0,
    name: "公司",
    category: "設備",
    region: "",
    status: "published",
    contacts: [contact()],
    consentConfirmed: true,
    reason: "已核實",
  };
  assert.equal(parsePartnerCommand(raw).action, "save-partner");
  fails(() => parsePartnerCommand({ ...raw, consentConfirmed: false }), 400);
  fails(() => parsePartnerCommand({ ...raw, userId: "forged" }), 400);
  fails(() => parsePartnerCommand({ ...raw, requestId: "not-uuid" }), 400);
});
