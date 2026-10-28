import type { CommercialDocumentContent } from "./commercial-document.js";
import { ContractError } from "./error.js";
import { addExactDecimals } from "./exact-decimal.js";
export type MoneyCheck = Readonly<{
  summaryId: string;
  checkKind: "SUMMARY_BALANCE";
  status: "PASS" | "MISMATCH" | "NOT_COMPUTABLE";
  code:
    | "BALANCED"
    | "AMOUNT_MISMATCH"
    | "UNKNOWN_CURRENCY"
    | "UNKNOWN_TAX_BASIS"
    | "MISSING_AMOUNT";
  computedAmount: string | null;
  reportedAmount: string | null;
}>;
export type MoneyReconciliationReport = Readonly<{
  rulesetVersion: 1;
  status: "PASS" | "MISMATCH" | "NOT_COMPUTABLE";
  checks: readonly MoneyCheck[];
}>;

/** Reconciles each reported summary in its own scope/currency; never totals summaries
 * together or treats subtotals as items. PASS describes these equations, not source completeness.
 */
export function reconcileDocumentAmounts(
  content: CommercialDocumentContent,
  rulesetVersion: number,
): MoneyReconciliationReport {
  if (rulesetVersion !== 1)
    throw new ContractError(400, "Unsupported reconciliation ruleset.", "INVALID_INPUT");
  const checks: MoneyCheck[] = content.totals.map((summary) => {
    const base = {
      summaryId: summary.summaryId,
      checkKind: "SUMMARY_BALANCE" as const,
      reportedAmount: summary.payableAmount.value,
    };
    const incomplete = (code: MoneyCheck["code"]): MoneyCheck => ({
      ...base,
      status: "NOT_COMPUTABLE",
      code,
      computedAmount: null,
    });
    if (summary.currencyCode === null) return incomplete("UNKNOWN_CURRENCY");
    if (summary.amountBasis === "MIXED" || summary.amountBasis === "UNSPECIFIED")
      return incomplete("UNKNOWN_TAX_BASIS");
    const amounts = [summary.itemsAmount.value, summary.nonTaxAdjustmentsAmount.value];
    if (summary.amountBasis === "TAX_EXCLUSIVE") amounts.push(summary.taxAmount.value);
    if (summary.payableAmount.value === null || amounts.some((value) => value === null))
      return incomplete("MISSING_AMOUNT");
    const computedAmount = addExactDecimals(
      amounts.filter((value): value is string => value !== null),
    );
    const match = computedAmount === summary.payableAmount.value;
    return {
      ...base,
      status: match ? "PASS" : "MISMATCH",
      code: match ? "BALANCED" : "AMOUNT_MISMATCH",
      computedAmount,
    };
  });
  const status = checks.some((check) => check.status === "MISMATCH")
    ? "MISMATCH"
    : checks.length === 0 || checks.some((check) => check.status === "NOT_COMPUTABLE")
      ? "NOT_COMPUTABLE"
      : "PASS";
  return { rulesetVersion: 1, status, checks };
}
