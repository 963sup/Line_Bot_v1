import { type FileInfo } from "@line_bot_v1/file/contracts/parse-files";
import React from "react";
import type { PendingCommercialIntake } from "./commercial-intake-state";
import { record } from "./files-projection";

const labels: Record<string, string> = {
  PURCHASE_ORDER: "採購單",
  QUOTATION: "報價單",
  ESTIMATE: "估價單",
  CONTRACT: "合約",
  UNCLASSIFIED: "未分類文件",
  documentNumber: "文件編號",
  documentRevisionLabel: "版本標示",
  title: "標題",
  issueDate: "發行日期",
  validUntilDate: "有效日期",
  defaultCurrencyCode: "預設幣別",
  itemNumber: "項次",
  referenceCode: "參考編號",
  description: "說明",
  quantity: "數量",
  unitLabel: "單位",
  unitPrice: "單價",
  lineAmount: "金額",
  deliveryDate: "交付日期",
  chargeKind: "費用類別",
  signedAmount: "調整金額",
  rate: "比率",
  reportedAmount: "小計",
  name: "名稱",
  postalAddress: "地址",
  payableAmount: "應付金額",
  taxAmount: "稅額",
  itemsAmount: "品項金額",
  nonTaxAdjustmentsAmount: "非稅調整",
  text: "條款",
};
function display(value: unknown): string {
  if (value === null || value === undefined) return "未提供";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  const p = record(value);
  if ("value" in p) return display(p.value);
  if ("amount" in p)
    return `${display(p.amount)} ${typeof p.currencyCode === "string" ? p.currencyCode : ""}`;
  return "—";
}
function extensions(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const reasons: Record<string, string> = {
    NOT_PRESENT: "原文未提供",
    UNREADABLE: "無法辨識",
    AMBIGUOUS: "內容不明確",
  };
  return (
    <dl className="grid gap-1" aria-label="保留欄位">
      {value.map((entry, index) => {
        const field = record(entry);
        return (
          <div key={typeof field.fieldId === "string" ? field.fieldId : index}>
            <dt className="inline text-muted-foreground">
              {typeof field.label === "string" ? field.label : "未命名欄位"}：
            </dt>
            <dd className="inline whitespace-pre-wrap break-words">
              {display(field.value)}
              {typeof field.unitLabel === "string" && field.unitLabel ? ` ${field.unitLabel}` : ""}
              <span className="text-xs text-muted-foreground">
                {typeof field.valueType === "string" ? ` · ${field.valueType}` : ""}
                {typeof field.missingReason === "string"
                  ? ` · ${reasons[field.missingReason] ?? field.missingReason}`
                  : ""}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
function fields(value: unknown) {
  const p = record(value);
  return (
    <div>
      <dl className="grid gap-1">
        {Object.entries(p)
          .filter(([key]) => key in labels)
          .map(([key, value]) => (
            <div key={key}>
              <dt className="inline text-muted-foreground">{labels[key]}：</dt>
              <dd className="inline whitespace-pre-wrap break-words">{display(value)}</dd>
            </div>
          ))}
      </dl>
      {extensions(p.extensionFields)}
    </div>
  );
}
export default function CommercialDraftReview({ revision }: { revision: unknown }) {
  const r = record(revision),
    c = record(r.content);
  const rows = Array.isArray(c.rows) ? c.rows : [],
    parties = Array.isArray(c.parties) ? c.parties : [],
    totals = Array.isArray(c.totals) ? c.totals : [],
    terms = Array.isArray(c.terms) ? c.terms : [];
  return (
    <section aria-label="商務文件草稿" className="space-y-3 rounded-md border p-3">
      {React.createElement(
        "h3",
        { className: "font-medium" },
        `${labels[String(c.documentKind)] ?? "商務文件"} · DRAFT 待人工審閱`,
      )}
      <p className="text-sm">
        文件 {String(r.documentId)} · 版本 {String(r.documentVersion)}
      </p>
      {fields(c.header)}
      {extensions(c.extensionFields)}
      {parties.map((p, i) => (
        <div key={i}>{fields(p)}</div>
      ))}
      <h4>明細（{rows.length}）</h4>
      {rows.map((row, i) => (
        <div key={i} className="rounded border p-2">
          <p>
            第 {i + 1} 列 · {String(record(row).rowType)}
          </p>
          {fields(row)}
        </div>
      ))}
      {totals.map((t, i) => (
        <div key={i}>{fields(t)}</div>
      ))}
      {terms.map((t, i) => (
        <div key={i}>{fields(t)}</div>
      ))}
      <p className="text-xs text-muted-foreground">AI 草稿需與原始檔核對；此頁僅供檢視 DRAFT。</p>
    </section>
  );
}

export function CommercialIntakeSource({
  source,
  repositoryId,
  selected,
}: {
  source: PendingCommercialIntake["source"];
  repositoryId: string;
  selected: FileInfo | null;
}) {
  const matches =
    selected !== null &&
    selected.repositoryId === repositoryId &&
    selected.fileId === source.fileId &&
    selected.revisionId === source.fileRevisionId &&
    selected.sha256 === source.sha256;
  return (
    <React.Fragment>
      <div className="space-y-1 rounded border p-2 text-xs" aria-label="此解析的固定來源">
        <h4 className="font-medium">此解析的固定來源</h4>
        <p className="break-all">File：{source.fileId}</p>
        <p className="break-all">Revision：{source.fileRevisionId}</p>
        <p className="break-all">SHA-256：{source.sha256}</p>
      </div>
      {!matches && (
        <p role="note" className="text-sm">
          {selected
            ? "目前選取的檔案或版本不同；下方解析與草稿仍屬於上述固定來源。切換檔案不會改變原操作。"
            : "尚未選取檔案；下方解析與草稿屬於上述固定來源。"}
        </p>
      )}
    </React.Fragment>
  );
}
