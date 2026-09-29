import { createGeminiClient } from "@line_bot_v1/assistant/gemini";
import { createCommandExpense } from "@line_bot_v1/expense/application/command-expense";
import { createGetExpense } from "@line_bot_v1/expense/application/get-expense";
import { createReceiptIntake } from "@line_bot_v1/expense/application/receipt-intake";
import { createRecognizeReceipt } from "@line_bot_v1/expense/application/recognize-receipt";
import { createGeminiReceiptRecognizer } from "@line_bot_v1/expense/composition/bootstrap/gemini-receipt-recognizer";
import { createPostgresExpenseStore } from "@line_bot_v1/expense/composition/bootstrap/postgres-expense-store";
import type { Expense } from "@line_bot_v1/expense/domain/aggregates/expense";
import { downloadLineImage } from "@line_bot_v1/line-channel/messaging";
import { activeLineUser } from "./account.server";

/** Global state is retained across Next.js hot reloads and remains process-local. */
const state = globalThis as typeof globalThis & {
  expenseStore?: ReturnType<typeof createPostgresExpenseStore>;
  expenseRecognition?: Map<string, Promise<Expense>>;
  nextReceiptAt?: number;
};

function expenseStore() {
  return (state.expenseStore ??= createPostgresExpenseStore());
}

const recognizeImage = async (imageId: string) => {
  return createGeminiReceiptRecognizer({
    downloadImage: (id) => downloadLineImage(id, process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ""),
    models: createGeminiClient({ apiKey: process.env.GEMINI_API_KEY ?? "" }).models,
    model: process.env.GEMINI_MODEL ?? "",
  })(imageId);
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
