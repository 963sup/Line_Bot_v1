import { intValue, listOf, record, stringValue } from "./files-projection";

export type DocumentIntakeReceipt = {
  requestId: string;
  documentId: string;
  revisionId: string;
  version: number;
  intentFingerprint: string;
};
type DocumentSource = { fileId: string; fileRevisionId: string; fileSha256: string };
export type DocumentIntakeRevision = {
  documentId: string;
  revisionId: string;
  version: number;
  state: "DRAFT" | "CONFIRMED";
  source: DocumentSource;
  candidate: Record<string, unknown>;
  diagnostics: string[];
};
export type DocumentIntakeCommand = {
  action: "save";
  repositoryId: string;
  documentId: string;
  requestId: string;
  expectedVersion: number;
  source: DocumentSource;
};
export const diagnosticLabels: Readonly<Record<string, string>> = {
  UNCERTAIN_LINE: "部分明細尚待釐清",
  MISSING_REQUIRED_FACT: "缺少必要的採購單資料",
  MISSING_SOURCE_PAGE: "部分明細缺少來源頁",
  DUPLICATE_SOURCE_ROW_ID: "來源明細重複",
  INVALID_LINE_MEASURE: "數量或單價不符合要求",
  LINE_AMOUNT_MISMATCH: "明細毛額、折扣與淨額不一致",
  LINE_GROSS_MISMATCH: "數量乘以單價與明細毛額不一致",
  GROSS_TOTAL_MISMATCH: "明細毛額與毛額合計不一致",
  DISCOUNT_TOTAL_MISMATCH: "明細折扣與折扣合計不一致",
  LINE_NET_TOTAL_MISMATCH: "明細淨額與淨額合計不一致",
  NET_TAX_TOTAL_MISMATCH: "淨額加稅額與應付總額不一致",
};
export function parseDocumentIntakeReceipt(value: unknown): DocumentIntakeReceipt {
  const r = record(value);
  return {
    requestId: stringValue(r.requestId),
    documentId: stringValue(r.documentId),
    revisionId: stringValue(r.revisionId),
    version: intValue(r.version),
    intentFingerprint: stringValue(r.intentFingerprint),
  };
}
function parseDocumentSource(value: unknown): DocumentSource {
  const r = record(value);
  return {
    fileId: stringValue(r.fileId),
    fileRevisionId: stringValue(r.fileRevisionId),
    fileSha256: stringValue(r.fileSha256),
  };
}
export function parseDocumentIntakeRevision(value: unknown): DocumentIntakeRevision {
  const r = record(value);
  const state = stringValue(r.state);
  if (state !== "DRAFT" && state !== "CONFIRMED")
    throw new Error("ContractDocument state is invalid.");
  return {
    documentId: stringValue(r.documentId),
    revisionId: stringValue(r.id),
    version: intValue(r.version),
    state,
    source: parseDocumentSource(r.source),
    candidate: record(r.candidate),
    diagnostics: listOf(r.diagnostics, stringValue),
  };
}
export function candidateLines(candidate: Record<string, unknown>) {
  return listOf(candidate.lines, (value) => {
    const line = record(value);
    return {
      sourceRowId: stringValue(line.sourceRowId),
      sourcePages: listOf(line.sourcePages, intValue),
    };
  });
}
export function sourceReviewPages(candidate: Record<string, unknown>): number[] {
  const pages = new Set<number>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = record(value);
    if (Array.isArray(object.sourcePages))
      for (const page of object.sourcePages) if (typeof page === "number") pages.add(page);
    Object.values(object).forEach(visit);
  };
  visit(candidate);
  return [...pages].sort((left, right) => left - right);
}
