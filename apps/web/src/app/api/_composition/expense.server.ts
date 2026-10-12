import { createGeminiClient } from "@line_bot_v1/assistant/gemini";
import { createCommandExpense } from "@line_bot_v1/expense/application/command-expense";
import { createGetExpense } from "@line_bot_v1/expense/application/get-expense";
import { createReceiptIntake } from "@line_bot_v1/expense/application/receipt-intake";
import { createRecognizeReceipt } from "@line_bot_v1/expense/application/recognize-receipt";
import { createGeminiReceiptRecognizer } from "@line_bot_v1/expense/composition/bootstrap/gemini-receipt-recognizer";
import { createPostgresExpenseStore } from "@line_bot_v1/expense/composition/bootstrap/postgres-expense-store";
import { downloadLineImage } from "@line_bot_v1/line/messaging-api";
import { activeLineUser } from "./account.server";

const recognizeImage = async (imageId: string) => {
  const models = createGeminiClient({ apiKey: process.env.GEMINI_API_KEY ?? "" }).models;
  return createGeminiReceiptRecognizer({
    downloadImage: (id) => downloadLineImage(id, process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ""),
    models: {
      generateContent: async (parameters) => {
        const response = await models.generateContent(parameters);
        return response.text === undefined ? {} : { text: response.text };
      },
    },
    model: process.env.GEMINI_MODEL ?? "",
  })(imageId);
};

/** Global state is retained across Next.js hot reloads and remains process-local. */
const state = globalThis as typeof globalThis & {
  expenseStore?: ReturnType<typeof createPostgresExpenseStore>;
  expenseRecognition?: Map<string, ReturnType<typeof recognizeImage>>;
  nextReceiptAt?: number;
};

function expenseStore() {
  return (state.expenseStore ??= createPostgresExpenseStore());
}

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
