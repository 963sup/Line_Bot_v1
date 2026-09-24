import { UserError } from "@line-work/account/domain/user";
import type { createCommandExpense } from "@line-work/expense/application/command-expense";
import type { createGetExpense } from "@line-work/expense/application/get-expense";
import type { createRecognizeReceipt } from "@line-work/expense/application/recognize-receipt";
import { type Expense, type ExpenseCommand, ExpenseError } from "@line-work/expense/domain";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

/**
 * 脫敏投影：過濾內部敏感屬性 (owner, scope, imageId)
 */
const publicExpense = (d: Expense) => {
  const { owner, scope, imageId, ...view } = d;
  return view;
};

type ExpenseRequests = {
  commandExpense: ReturnType<typeof createCommandExpense>;
  getExpense: ReturnType<typeof createGetExpense>;
  recognizeReceipt: ReturnType<typeof createRecognizeReceipt>;
  requestIdentity: (request: Request) => Promise<string>;
};

/**
 * 核心請求調度管線
 */
async function run(
  request: Request,
  context: { params: Promise<{ id: string }> },
  mutate: boolean,
  expense: ExpenseRequests,
) {
  try {
    // 1. 同源檢查（防範 CSRF 攻擊）
    if (mutate && request.headers.get("origin") !== process.env.APP_ORIGIN) {
      throw new ExpenseError(403, "來源不符，請重新開啟操作頁。");
    }

    // 2. 密碼學身分驗證；各用例在持久化邊界前查核 active membership。
    const subject = await expense.requestIdentity(request);

    // 3. 實體 ID 格式正規化白名單檢查
    const { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ExpenseError(404, "資料不存在。");
    // 4. 唯讀查詢路徑 (GET)
    if (!mutate) return json(publicExpense(await expense.getExpense(subject, id)));

    // 5. 變更操作路徑 (POST) - 酬載尺寸嚴格限制 (<=8KB)
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw new ExpenseError(415, "資料格式不正確。");
    }
    let text: string;
    try {
      text = await readBodyText(request, 8192);
    } catch (error) {
      if (error instanceof BodyTooLargeError) throw new ExpenseError(413, "資料過大。");
      throw error;
    }

    let command: ExpenseCommand | { type: "recognize"; revision: number };
    try {
      command = JSON.parse(text);
    } catch {
      throw new ExpenseError(400, "資料格式不正確。");
    }
    if (!command || !Number.isInteger(command.revision)) {
      throw new ExpenseError(400, "缺少資料版本。");
    }

    // 6. 狀態躍遷執行：AI 辨識或實體命令推進
    const d =
      command.type === "recognize"
        ? ((await expense.recognizeReceipt(subject, id, command.revision)) as Expense)
        : await expense.commandExpense(subject, id, command);

    // 核心約定：靜默操作，不觸發任何 LINE 群聊廣播訊息
    return json(publicExpense(d));
  } catch (error) {
    const known =
      error instanceof ExpenseError ||
      error instanceof UserError ||
      error instanceof RequestIdentityError;
    const status = known ? error.status : 503;
    captureHandledServerError(error, {
      service: "expense-api",
      operation: mutate ? "change" : "read",
      status,
    });
    return known
      ? json({ error: error.message }, status)
      : json({ error: "服務暫不可用，請稍後重試。" }, 503);
  }
}

export function createExpenseRequest(expense: ExpenseRequests) {
  return {
    GET: (request: Request, context: { params: Promise<{ id: string }> }) =>
      run(request, context, false, expense),
    POST: (request: Request, context: { params: Promise<{ id: string }> }) =>
      run(request, context, true, expense),
  };
}
