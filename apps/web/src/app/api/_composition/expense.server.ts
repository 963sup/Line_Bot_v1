import { createGeminiClient } from "@line-work/assistant/adapters/gemini";
import { PostgresExpenseStore } from "@line-work/expense/adapters/postgres";
import { runReceiptAgent } from "@line-work/expense/agents/receipt";
import { createCommandExpense } from "@line-work/expense/application/command-expense";
import { createGetExpense } from "@line-work/expense/application/get-expense";
import { createReceiptIntake } from "@line-work/expense/application/receipt-intake";
import { createRecognizeReceipt } from "@line-work/expense/application/recognize-receipt";
import type { Expense } from "@line-work/expense/domain";
import { downloadLineImage } from "@line-work/line-channel/adapters/messaging";
import { activeLineUser } from "./account.server";

/** Global state is retained across Next.js hot reloads and remains process-local. */
const state = globalThis as typeof globalThis & {
  expenseStore?: PostgresExpenseStore;
  expenseRecognition?: Map<string, Promise<Expense>>;
  nextReceiptAt?: number;
};

function expenseStore() {
  return (state.expenseStore ??= new PostgresExpenseStore());
}

const recognizeImage = async (imageId: string) => {
  const file = await downloadLineImage(imageId, process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "");
  return runReceiptAgent({
    models: createGeminiClient({ apiKey: process.env.GEMINI_API_KEY ?? "" }).models,
    model: process.env.GEMINI_MODEL ?? "",
    ...file,
  });
};

const dependencies = {
  activeUser: activeLineUser,
  store: expenseStore,
};

export const getExpense = createGetExpense(dependencies);
export const commandExpense = createCommandExpense(dependencies);
export const recognizeReceipt = createRecognizeReceipt({
  ...dependencies,
  recognize: recognizeImage,
  recognition: (state.expenseRecognition ??= new Map()),
  nextReceiptAt: () => state.nextReceiptAt,
  setNextReceiptAt: (value) => {
    state.nextReceiptAt = value;
  },
  now: Date.now,
  cooldownMs: 30_000,
});
export const receiptIntake = createReceiptIntake(dependencies);
