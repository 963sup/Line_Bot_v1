import { type Expense, ExpenseError } from "../domain.js";
import type { ActiveExpenseUser, ExpenseRepository } from "./ports/expense-repository.js";
import type { ReceiptRecognizer } from "./ports/receipt-recognizer.js";

export interface ReceiptRecognitionDependencies {
  activeUser: ActiveExpenseUser;
  store(): ExpenseRepository;
  recognize: ReceiptRecognizer;
  recognition: Map<string, Promise<Expense>>;
  nextReceiptAt(): number | undefined;
  setNextReceiptAt(value: number): void;
  now(): number;
  cooldownMs: number;
}

/**
 * Recognizes one pending receipt. The process-local map merges duplicate model calls;
 * persistence remains responsible for the final transactional revision recheck.
 */
export function createRecognizeReceipt(deps: ReceiptRecognitionDependencies) {
  return async (subject: string, id: string, revision: number): Promise<Expense> => {
    const owner = (await deps.activeUser(subject)).id;
    const current = await deps.store().get(id, owner);

    if (current.status !== "pending") return current;
    if (current.revision !== revision) throw new ExpenseError(409, "資料已更新，請重新載入。");

    const existing = deps.recognition.get(id);
    if (existing) return existing;

    const now = deps.now();
    if (now < (deps.nextReceiptAt() ?? 0))
      throw new ExpenseError(429, "辨識冷卻中，請 30 秒後重試。");
    deps.setNextReceiptAt(now + deps.cooldownMs);

    let resolve!: (expense: Expense) => void;
    let reject!: (reason: unknown) => void;
    const inFlight = new Promise<Expense>((done, failed) => {
      resolve = done;
      reject = failed;
    });
    deps.recognition.set(id, inFlight);

    void (async () => {
      try {
        const reading = await deps.recognize(current.imageId);
        resolve(await deps.store().recognized(id, owner, revision, reading));
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
