import type { ReceiptRecognizer } from "../contracts/ports/receipt-recognizer.js";
import type { ReceiptReading } from "../contracts/receipt-reading.js";
import type {
  ActiveExpenseUser,
  ExpenseRepository,
} from "../contracts/repositories/expense-repository.js";
import { ExpenseError } from "../domain/aggregates/expense.js";

export interface ReceiptRecognitionDependencies {
  activeUser: ActiveExpenseUser;
  store(): ExpenseRepository;
  recognize: ReceiptRecognizer;
  recognition: Map<string, Promise<ReceiptReading>>;
  nextReceiptAt(): number | undefined;
  setNextReceiptAt(value: number): void;
  now(): number;
  cooldownMs: number;
}

/**
 * Recognizes one pending receipt without mutating Expense state.
 * The model result stays an untrusted transient reading until the owner explicitly saves or confirms it.
 */
export function createRecognizeReceipt(deps: ReceiptRecognitionDependencies) {
  return async (subject: string, id: string, revision: number): Promise<ReceiptReading> => {
    const owner = (await deps.activeUser(subject)).id;
    const current = await deps.store().get(id, owner);

    if (current.status !== "pending")
      throw new ExpenseError(409, "這筆支出已進入後續處理，請重新載入。");
    if (current.revision !== revision) throw new ExpenseError(409, "資料已更新，請重新載入。");

    const existing = deps.recognition.get(id);
    if (existing) return existing;

    const now = deps.now();
    if (now < (deps.nextReceiptAt() ?? 0))
      throw new ExpenseError(429, "辨識冷卻中，請 30 秒後重試。");
    deps.setNextReceiptAt(now + deps.cooldownMs);

    let resolve!: (reading: ReceiptReading) => void;
    let reject!: (reason: unknown) => void;
    const inFlight = new Promise<ReceiptReading>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    deps.recognition.set(id, inFlight);

    void (async () => {
      try {
        const reading = await deps.recognize(current.imageId);
        if (!reading.isReceipt) throw new ExpenseError(422, "無法確認為收據，請重新傳送清晰圖片。");

        const latest = await deps.store().get(id, owner);
        if (latest.status !== "pending" || latest.revision !== revision) {
          throw new ExpenseError(409, "資料已更新，請重新載入。");
        }
        resolve(reading);
      } catch (error) {
        reject(
          error instanceof ExpenseError
            ? error
            : new ExpenseError(503, "辨識暫不可用，請稍後重試；尚未入帳。"),
        );
      } finally {
        if (deps.recognition.get(id) === inFlight) deps.recognition.delete(id);
      }
    })();

    return inFlight;
  };
}
