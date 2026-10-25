import { createCommandExpense } from "@line_bot_v1/expense/application/command-expense";
import { createGetExpense } from "@line_bot_v1/expense/application/get-expense";
import { createReceiptIntake } from "@line_bot_v1/expense/application/receipt-intake";
import { createRecognizeReceipt } from "@line_bot_v1/expense/application/recognize-receipt";
import { createPostgresExpenseStore } from "@line_bot_v1/expense/composition/bootstrap/postgres-expense-store";
import { createReceiptRecognizer } from "@line_bot_v1/expense/composition/bootstrap/receipt-recognizer";
import { downloadLineImage } from "@line_bot_v1/line/messaging-api";
import { createVercelAiGateway } from "../../../../../../vercel/integrations/gateway.ts";
import { activeLineUser } from "./account.server";

const recognizeImage = async (imageId: string) => {
  const model = process.env.AI_GATEWAY_MODEL;
  if (!model) throw new Error("AI Gateway is not configured");
  return createReceiptRecognizer({
    downloadImage: (id) => downloadLineImage(id, process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ""),
    generate: createVercelAiGateway({ model }).receipt,
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
