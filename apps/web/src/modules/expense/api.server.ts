import { UserError } from "@line_bot_v1/account/domain/user";
import type { createCommandExpense } from "@line_bot_v1/expense/application/command-expense";
import type { createGetExpense } from "@line_bot_v1/expense/application/get-expense";
import type { createRecognizeReceipt } from "@line_bot_v1/expense/application/recognize-receipt";
import { toExpenseApiView } from "@line_bot_v1/expense/contracts/dto/expense-api-view";
import {
  type ExpenseFailureReason,
  ExpenseOperationError,
} from "@line_bot_v1/expense/contracts/dto/expense-failure";
import { type ExpenseCommand, ExpenseError } from "@line_bot_v1/expense/domain/aggregates/expense";
import { captureHandledServerError } from "../../shared/observability/server-error";
import { BodyTooLargeError, readBodyText } from "../../shared/server/http";
import { RequestIdentityError } from "../../shared/server/request-identity-error";

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

type ExpenseRequests = {
  commandExpense: ReturnType<typeof createCommandExpense>;
  getExpense: ReturnType<typeof createGetExpense>;
  recognizeReceipt: ReturnType<typeof createRecognizeReceipt>;
  requestIdentity: (request: Request) => Promise<string>;
};

class ExpenseRequestError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}

const expenseHttpStatus = {
  "invalid-fields": 400,
  "invalid-command": 400,
  "invalid-expense": 500,
  "invalid-record": 500,
  "version-conflict": 409,
  "terminal-conflict": 409,
  "access-denied": 403,
  "not-found": 404,
  "recognition-conflict": 409,
  "recognition-cooldown": 429,
  "not-a-receipt": 422,
  "recognition-unavailable": 503,
} satisfies Record<ExpenseFailureReason, number>;

async function run(
  request: Request,
  context: { params: Promise<{ id: string }> },
  mutate: boolean,
  expense: ExpenseRequests,
) {
  try {
    if (mutate && request.headers.get("origin") !== process.env.APP_ORIGIN) {
      throw new ExpenseRequestError(403, "來源不符，請重新開啟操作頁。");
    }

    const subject = await expense.requestIdentity(request);
    const { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ExpenseRequestError(404, "資料不存在。");
    if (!mutate) return json(toExpenseApiView(await expense.getExpense(subject, id)));

    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw new ExpenseRequestError(415, "資料格式不正確。");
    }
    let text: string;
    try {
      text = await readBodyText(request, 8192);
    } catch (error) {
      if (error instanceof BodyTooLargeError) throw new ExpenseRequestError(413, "資料過大。");
      throw error;
    }

    let command: ExpenseCommand | { type: "recognize"; revision: number };
    try {
      command = JSON.parse(text);
    } catch {
      throw new ExpenseRequestError(400, "資料格式不正確。");
    }
    if (!command || !Number.isInteger(command.revision)) {
      throw new ExpenseRequestError(400, "缺少資料版本。");
    }

    if (command.type === "recognize") {
      const reading = await expense.recognizeReceipt(subject, id, command.revision);
      return json({ reading });
    }

    const d = await expense.commandExpense(subject, id, command);
    return json(toExpenseApiView(d));
  } catch (error) {
    const requestFailure =
      error instanceof ExpenseRequestError ||
      error instanceof UserError ||
      error instanceof RequestIdentityError;
    const expenseFailure = error instanceof ExpenseError || error instanceof ExpenseOperationError;
    const known = expenseFailure || requestFailure;
    const status = expenseFailure
      ? expenseHttpStatus[error.reason]
      : requestFailure
        ? error.status
        : 503;
    captureHandledServerError(error, {
      service: "expense-api",
      operation: mutate ? "change" : "read",
      status,
    });
    return known
      ? json({ error: error.message }, status)
      : json({ error: "服務暫不可用，請稍後重試。" }, status);
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
