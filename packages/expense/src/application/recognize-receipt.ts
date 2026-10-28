import { ExpenseOperationError } from "../contracts/dto/expense-failure.js";
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

function deferred<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  if (!resolve || !reject) throw new Error("Promise executor did not initialize synchronously");
  return { promise, resolve, reject };
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
      throw new ExpenseOperationError(
        "recognition-conflict",
        "這筆支出已進入後續處理，請重新載入。",
      );
    if (current.revision !== revision)
      throw new ExpenseError("version-conflict", "資料已更新，請重新載入。");

    const existing = deps.recognition.get(id);
    if (existing) return existing;

    const now = deps.now();
    if (now < (deps.nextReceiptAt() ?? 0))
      throw new ExpenseOperationError("recognition-cooldown", "辨識冷卻中，請 30 秒後重試。");
    deps.setNextReceiptAt(now + deps.cooldownMs);

    const { promise: inFlight, resolve, reject } = deferred<ReceiptReading>();
    deps.recognition.set(id, inFlight);

    void (async () => {
      try {
        const reading = await deps.recognize(current.imageId);
        if (!reading.isReceipt)
          throw new ExpenseOperationError("not-a-receipt", "無法確認為收據，請重新傳送清晰圖片。");

        const latest = await deps.store().get(id, owner);
        if (latest.status !== "pending")
          throw new ExpenseOperationError("recognition-conflict", "資料已更新，請重新載入。");
        if (latest.revision !== revision)
          throw new ExpenseError("version-conflict", "資料已更新，請重新載入。");
        resolve(reading);
      } catch (error) {
        reject(
          error instanceof ExpenseError || error instanceof ExpenseOperationError
            ? error
            : new ExpenseOperationError(
                "recognition-unavailable",
                error instanceof Error ? error.message : String(error),
              ),
        );
      } finally {
        if (deps.recognition.get(id) === inFlight) deps.recognition.delete(id);
      }
    })();

    return inFlight;
  };
}
