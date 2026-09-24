import { createExpenseRequest } from "../../../../modules/expense/api.server";
import { commandExpense, getExpense, recognizeReceipt } from "../../_composition/expense.server";
import { requestLineIdentity } from "../../_composition/request-identity.server";

export const { GET, POST } = createExpenseRequest({
  commandExpense,
  getExpense,
  recognizeReceipt,
  requestIdentity: requestLineIdentity,
});
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
