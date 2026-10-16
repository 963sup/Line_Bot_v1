import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { executePartnerCommand } from "../src/application/use-cases/partner-mutations.js";
import type {
  PartnerMutationTransaction,
  PartnerMutationTransactions,
  PartnerReceipt,
} from "../src/contracts/output/partner-mutations.js";
import { PartnerError } from "../src/domain.js";

test("save mutation owns qualification, replay, version, transition, persistence and final permission recheck", async () => {
  const order: string[] = [];
  const id = randomUUID();
  const contactId = randomUUID();
  const command = {
    action: "save-partner" as const,
    requestId: randomUUID(),
    id,
    expectedVersion: 0,
    name: "夥伴",
    category: "設備",
    region: "",
    status: "published" as const,
    contacts: [
      {
        id: contactId,
        name: "窗口",
        responsibility: "聯絡",
        phone: "0212345678",
        email: "",
        line: "",
        status: "published" as const,
      },
    ],
    reason: "已核實",
    consentConfirmed: true as const,
  };
  let allowed = true;
  let replay: PartnerReceipt | null = null;
  const tx: PartnerMutationTransaction = {
    canReview: false,
    async canManage() {
      order.push("permission");
      return allowed;
    },
    async replay() {
      order.push("replay");
      return replay;
    },
    async record(receipt) {
      order.push("receipt");
      replay = receipt;
    },
    async partnerVersion() {
      order.push("version");
      return null;
    },
    async existingContacts() {
      order.push("contacts");
      return [];
    },
    async duplicateContact() {
      order.push("unique");
      return false;
    },
    async lockDirectory() {
      order.push("directory-lock");
    },
    async savePartner(next) {
      order.push("save");
      assert.equal(next.version, 1);
    },
    async refer() {
      throw Error("unexpected refer");
    },
    async referral() {
      throw Error("unexpected referral");
    },
    async withdraw() {
      throw Error("unexpected withdraw");
    },
    async reject() {
      throw Error("unexpected reject");
    },
    async publish() {
      throw Error("unexpected publish");
    },
  };
  const transactions: PartnerMutationTransactions = {
    async run(actor, request, work) {
      assert.equal(actor, "actor");
      assert.equal(request.kind, "management");
      return work(tx);
    },
  };
  const first = await executePartnerCommand(transactions, "actor", command, 100);
  assert.deepEqual(order, [
    "permission",
    "replay",
    "version",
    "contacts",
    "unique",
    "save",
    "permission",
    "receipt",
  ]);
  assert.deepEqual(first, { id, version: 1, at: 100, requestId: command.requestId });
  order.length = 0;
  assert.deepEqual(await executePartnerCommand(transactions, "actor", command, 101), first);
  assert.deepEqual(order, ["permission", "replay"]);
  allowed = false;
  await assert.rejects(
    executePartnerCommand(transactions, "actor", command, 102),
    (error: unknown) => error instanceof PartnerError && error.status === 403,
  );
  assert.deepEqual(order.slice(-1), ["permission"]);
});

test("reviewer cannot approve without permission, and successful approval locks and atomically publishes", async () => {
  const order: string[] = [];
  const referralId = randomUUID();
  const state = {
    submitter: "submitter",
    status: "pending" as const,
    method: "phone" as const,
    value: "0212345678",
    partnerName: "供應商",
    category: "設備",
    region: "",
    contactName: "窗口",
    responsibility: "聯絡",
  };
  let canReview = false;
  const tx: PartnerMutationTransaction = {
    get canReview() {
      return canReview;
    },
    async canManage() {
      throw Error("unexpected");
    },
    async replay() {
      order.push("replay");
      return null;
    },
    async record() {
      order.push("receipt");
    },
    async publish(id, referral) {
      order.push("publish");
      assert.equal(id, referralId);
      assert.equal(referral.partnerName, state.partnerName);
    },
  };
  const transactions: PartnerMutationTransactions = {
    async run(_actor, _r, work) {
      return work(tx);
    },
  };
  const command = {
    action: "review" as const,
    requestId: randomUUID(),
    referralId,
    status: "successful" as const,
    reviewNote: "",
  };
  await assert.rejects(
    executePartnerCommand(transactions, "reviewer", command, 10),
    (error: unknown) => error instanceof PartnerError && error.status === 403,
  );
  assert.deepEqual(order, ["replay", "load"]);
  order.length = 0;
  canReview = true;
  assert.deepEqual(await executePartnerCommand(transactions, "reviewer", command, 10), {
    id: referralId,
  });
  assert.deepEqual(order, ["replay", "load", "directory-lock", "unique", "publish", "receipt"]);
});
