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

const expenseRecognition = new Map<string, ReturnType<typeof recognizeImage>>();
let nextReceiptAt: number | undefined;

function expenseStore() {
  return (globalThis.expenseStore ??= createPostgresExpenseStore());
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
  recognition: expenseRecognition,
  nextReceiptAt: () => nextReceiptAt,
  setNextReceiptAt: (value) => {
    nextReceiptAt = value;
  },
  now: Date.now,
  cooldownMs: 30_000,
});
export const receiptIntake = createReceiptIntake(dependencies);
