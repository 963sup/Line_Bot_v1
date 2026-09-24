import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReceiptIntakeStore } from "../src/application/ports/receipt-intake.js";
import {
  createReceiptIntake,
  type ReceiptIntakeCommand,
} from "../src/application/receipt-intake.js";
import type { Expense } from "../src/domain.js";

test("receipt intake authenticates every operation before accessing storage", async () => {
  const denied = new Error("inactive member");
  const intake = createReceiptIntake({
    activeUser: async () => {
      throw denied;
    },
    store: () => {
      throw new Error("storage must not be accessed");
    },
  });
  const commands: ReceiptIntakeCommand[] = [
    { type: "start" },
    { type: "cancel" },
    { type: "receive", imageId: "image" },
  ];
  for (const command of commands)
    await assert.rejects(intake("subject", "group:A", command), (error) => error === denied);
});

test("receipt intake uses backend member ID, preserves scope and propagates storage failure", async () => {
  const calls: unknown[][] = [];
  const store: ReceiptIntakeStore = {
    arm: async (...args) => {
      calls.push(["arm", ...args]);
    },
    cancelIntent: async (...args) => {
      calls.push(["cancel", ...args]);
    },
    receive: async (...args) => {
      calls.push(["receive", ...args]);
      return null;
    },
  };
  const intake = createReceiptIntake({
    activeUser: async (subject) => {
      assert.equal(subject, "line-subject");
      return { id: "stable-member-id" };
    },
    store: () => store,
  });
  assert.deepEqual(await intake("line-subject", "group:A", { type: "start" }), { type: "started" });
  assert.deepEqual(await intake("line-subject", "group:B", { type: "cancel" }), {
    type: "cancelled",
  });
  assert.deepEqual(await intake("line-subject", "group:B", { type: "receive", imageId: "image" }), {
    type: "ignored",
  });
  assert.deepEqual(calls, [
    ["arm", "group:A", "stable-member-id"],
    ["cancel", "group:B", "stable-member-id"],
    ["receive", "group:B", "stable-member-id", "image"],
  ]);
  const failure = new Error("database unavailable");
  store.arm = async () => {
    throw failure;
  };
  await assert.rejects(
    intake("line-subject", "group:A", { type: "start" }),
    (error) => error === failure,
  );
});

test("received result preserves the persisted expense and rechecks membership on the next operation", async () => {
  const expense: Expense = {
    id: "receipt-id",
    number: 1,
    owner: "member",
    scope: "group:A",
    imageId: "image",
    status: "pending",
    revision: 1,
    createdAt: 1,
    merchant: "",
    amount: "",
    currency: "",
    date: "",
    invoiceNumber: "",
    project: "",
    payment: "",
  };
  let active = true;
  let receives = 0;
  let storeLookups = 0;
  const store: ReceiptIntakeStore = {
    arm: async () => {},
    cancelIntent: async () => {},
    receive: async (scope, owner, imageId) => {
      assert.deepEqual([scope, owner, imageId], [expense.scope, expense.owner, expense.imageId]);
      receives++;
      return expense;
    },
  };
  const intake = createReceiptIntake({
    activeUser: async () => {
      if (!active) throw new Error("suspended");
      return { id: "member" };
    },
    store: () => {
      storeLookups++;
      return store;
    },
  });
  assert.equal(storeLookups, 0, "constructing a use case must not open a database");
  const result = await intake("subject", "group:A", { type: "receive", imageId: "image" });
  assert.equal(result.type, "received");
  if (result.type === "received") assert.equal(result.expense, expense);
  active = false;
  await assert.rejects(
    intake("subject", "group:A", { type: "receive", imageId: "image" }),
    /suspended/,
  );
  assert.equal(receives, 1);
  assert.equal(storeLookups, 1);
});
