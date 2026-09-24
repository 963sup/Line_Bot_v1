import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommandExpense } from "../src/application/command-expense.js";
import { createGetExpense } from "../src/application/get-expense.js";
import type { ExpenseRepository } from "../src/application/ports/expense-repository.js";
import { createRecognizeReceipt } from "../src/application/recognize-receipt.js";
import type { ReceiptReading } from "../src/contracts/receipt-reading.js";
import { type Expense, type ExpenseCommand, ExpenseError } from "../src/domain.js";

const pending = (overrides: Partial<Expense> = {}): Expense => ({
  id: "expense-id",
  number: 1,
  owner: "stable-owner",
  scope: "group:A",
  imageId: "line-image",
  status: "pending",
  revision: 1,
  createdAt: 1,
  merchant: "",
  amount: "",
  currency: "",
  date: "",
  invoiceNumber: "",
  payment: "",
  ...overrides,
});

const reading: ReceiptReading = {
  isReceipt: true,
  merchant: "Store",
  amount: "120",
  currency: "TWD",
  date: "2026-09-06",
  invoiceNumber: null,
  uncertainFields: [],
};

function repository(expense = pending()) {
  const calls: unknown[][] = [];
  const store: ExpenseRepository = {
    get: async (...args) => {
      calls.push(["get", ...args]);
      return expense;
    },
    command: async (...args) => {
      calls.push(["command", ...args]);
      return expense;
    },
    recognized: async (...args) => {
      calls.push(["recognized", ...args]);
      return { ...expense, status: "draft", revision: expense.revision + 1 };
    },
  };
  return { store, calls };
}

test("expense get and command resolve the server-side subject to a stable owner", async () => {
  const { store, calls } = repository();
  const activeUser = async (subject: string) => {
    assert.equal(subject, "verified-line-subject");
    return { id: "stable-owner" };
  };
  const get = createGetExpense({ activeUser, store: () => store });
  const command = createCommandExpense({ activeUser, store: () => store });
  const mutation: ExpenseCommand = { type: "cancel", revision: 1 };
  await get("verified-line-subject", "expense-id");
  await command("verified-line-subject", "expense-id", mutation);
  assert.deepEqual(calls, [
    ["get", "expense-id", "stable-owner"],
    ["command", "expense-id", "stable-owner", mutation],
  ]);
});

test("expense use cases reject before storage when the verified subject has no active member", async () => {
  const denied = new ExpenseError(403, "inactive");
  const store = () => {
    throw new Error("storage must not be accessed");
  };
  const activeUser = async () => {
    throw denied;
  };
  await assert.rejects(
    createGetExpense({ activeUser, store })("subject", "expense"),
    (e) => e === denied,
  );
  await assert.rejects(
    createCommandExpense({ activeUser, store })("subject", "expense", {
      type: "cancel",
      revision: 1,
    }),
    (e) => e === denied,
  );
});

test("recognition preserves pending shortcut and rejects a stale revision before model work", async () => {
  const completed = pending({ status: "draft", revision: 3 });
  const ready = repository(completed);
  let runs = 0;
  const recognize = createRecognizeReceipt({
    activeUser: async () => ({ id: "stable-owner" }),
    store: () => ready.store,
    recognize: async () => {
      runs++;
      return reading;
    },
    recognition: new Map(),
    nextReceiptAt: () => undefined,
    setNextReceiptAt: () => {},
    now: () => 1,
    cooldownMs: 30_000,
  });
  assert.equal(await recognize("subject", "expense-id", 1), completed);
  assert.equal(runs, 0);

  const stale = repository(pending({ revision: 2 }));
  const staleRecognize = createRecognizeReceipt({
    activeUser: async () => ({ id: "stable-owner" }),
    store: () => stale.store,
    recognize: async () => reading,
    recognition: new Map(),
    nextReceiptAt: () => undefined,
    setNextReceiptAt: () => {},
    now: () => 1,
    cooldownMs: 30_000,
  });
  await assert.rejects(staleRecognize("subject", "expense-id", 1), (error: unknown) => {
    return error instanceof ExpenseError && error.status === 409;
  });
});

test("recognition merges concurrent calls, enforces cooldown, wraps failures, and allows retry", async () => {
  const { store, calls } = repository();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let runs = 0;
  let nextReceiptAt: number | undefined;
  const recognition = new Map<string, Promise<Expense>>();
  const recognize = createRecognizeReceipt({
    activeUser: async () => ({ id: "stable-owner" }),
    store: () => store,
    recognize: async () => {
      runs++;
      entered();
      await blocked;
      return reading;
    },
    recognition,
    nextReceiptAt: () => nextReceiptAt,
    setNextReceiptAt: (value) => {
      nextReceiptAt = value;
    },
    now: () => 100,
    cooldownMs: 30_000,
  });
  const first = recognize("subject", "expense-id", 1);
  const second = recognize("subject", "expense-id", 1);
  await started;
  assert.equal(runs, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [
    pending({ status: "draft", revision: 2 }),
    pending({ status: "draft", revision: 2 }),
  ]);
  assert.equal(calls.filter(([name]) => name === "recognized").length, 1);
  assert.equal(recognition.size, 0);

  await assert.rejects(recognize("subject", "another-id", 1), (error: unknown) => {
    return error instanceof ExpenseError && error.status === 429;
  });

  const retryStore = repository();
  let attempts = 0;
  const retry = createRecognizeReceipt({
    activeUser: async () => ({ id: "stable-owner" }),
    store: () => retryStore.store,
    recognize: async () => {
      attempts++;
      if (attempts === 1) throw new Error("model unavailable");
      return reading;
    },
    recognition: new Map(),
    nextReceiptAt: () => undefined,
    setNextReceiptAt: () => {},
    now: () => 1,
    cooldownMs: 30_000,
  });
  await assert.rejects(retry("subject", "expense-id", 1), (error: unknown) => {
    return error instanceof ExpenseError && error.status === 503;
  });
  assert.equal((await retry("subject", "expense-id", 1)).status, "draft");
});
