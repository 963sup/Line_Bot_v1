import { intValue, listOf, record, stringValue } from "./files-projection";

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
