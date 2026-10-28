import { createHash } from "node:crypto";
import { commercialDocumentContentSchema } from "../contracts/input/commercial-document.js";
import type { CommercialDocumentContent } from "../domain/commercial-document.js";
import {
  type MoneyReconciliationReport as AmountReport,
  reconcileDocumentAmounts as reconcileAmounts,
} from "../domain/commercial-document-money.js";
export type MoneyReconciliationReport = AmountReport & { readonly contentFingerprint: string };

/** Canonical boundary decoding gives fingerprints stable key order and exact decimals. */
export function reconcileDocumentAmounts(
  input: CommercialDocumentContent,
  rulesetVersion: number,
): MoneyReconciliationReport {
  const content = commercialDocumentContentSchema.parse(input);
  const report = reconcileAmounts(content, rulesetVersion);
  const contentFingerprint = createHash("sha256")
    .update("commercial-document-content/1\n")
    .update(JSON.stringify(content))
    .digest("hex");
  return { ...report, contentFingerprint };
}
