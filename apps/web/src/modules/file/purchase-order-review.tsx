const fields: Readonly<Record<string, string>> = {
  documentNumber: "採購單號",
  revision: "版次",
  issueDate: "開立日期",
  title: "文件名稱",
  currency: "幣別",
  name: "名稱",
  registrationNumber: "統一編號",
  itemNumber: "項次",
  category: "類別",
  materialCode: "料號",
  description: "品項說明",
  quantity: "數量",
  unit: "單位",
  unitPrice: "單價",
  grossAmount: "毛額",
  discountAmount: "折扣",
  netAmount: "淨額",
  deliveryDate: "交貨日期",
  gross: "毛額合計",
  discount: "折扣合計",
  net: "淨額合計",
  tax: "稅額",
  total: "應付總額",
  text: "條款內容",
  sourcePages: "來源頁",
  rawText: "原文",
  confidence: "辨識信心",
  field: "欄位",
  original: "原始值",
  replacement: "修正值",
  reason: "修正原因",
};
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未提供";
  if (Array.isArray(value)) return value.length ? value.map(display).join("、") : "未提供";
  return String(value);
}
function Facts({ value }: { value: unknown }) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {Object.entries(object(value))
        .filter(([key]) => key !== "sourceRowId" && key !== "uncertain")
        .map(([key, item]) => (
          <div key={key} className="min-w-0">
            <dt className="text-muted-foreground">{fields[key] ?? key}</dt>
            <dd className="break-words whitespace-pre-wrap">{display(item)}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Show every extracted commercial fact before asking the user to attest to source coverage. */
export default function PurchaseOrderReview({ candidate }: { candidate: Record<string, unknown> }) {
  const lines = Array.isArray(candidate.lines) ? candidate.lines : [];
  return (
    <div className="grid min-w-0 gap-4">
      {(
        [
          ["文件資料", candidate.header],
          ["買方", candidate.buyer],
          ["賣方", candidate.seller],
        ] as const
      ).map(([title, value]) => (
        <section key={title} className="grid gap-2">
          <h3 className="font-medium">{title}</h3>
          <Facts value={value} />
        </section>
      ))}
      <section className="grid gap-2" aria-label="採購明細">
        <h3 className="font-medium">採購明細（{lines.length} 筆）</h3>
        {lines.map((value, index) => {
          const line = object(value);
          return (
            <div key={display(line.sourceRowId)} className="grid gap-2 rounded border p-3">
              <h4 className="text-sm font-medium">
                明細 {index + 1}
                {line.uncertain === true ? " · 尚待釐清" : ""}
              </h4>
              <Facts value={line} />
            </div>
          );
        })}
      </section>
      <section className="grid gap-2">
        <h3 className="font-medium">金額合計</h3>
        <Facts value={candidate.totals} />
      </section>
      <section className="grid gap-2">
        <h3 className="font-medium">交易條款</h3>
        <Facts value={candidate.terms} />
      </section>
      {Object.keys(object(candidate.fieldEvidence)).length > 0 && (
        <details className="grid gap-2">
          <summary className="cursor-pointer text-sm font-medium">查看來源佐證</summary>
          {Object.entries(object(candidate.fieldEvidence)).map(([field, values]) => (
            <section key={field} className="grid gap-2 py-2">
              <h4 className="break-words text-sm">{field}</h4>
              {Array.isArray(values) &&
                values.map((value, index) => <Facts key={index} value={value} />)}
            </section>
          ))}
        </details>
      )}
      {Array.isArray(candidate.corrections) && candidate.corrections.length > 0 && (
        <section className="grid gap-2">
          <h3 className="font-medium">辨識修正紀錄</h3>
          {candidate.corrections.map((value, index) => (
            <Facts key={index} value={value} />
          ))}
        </section>
      )}
    </div>
  );
}
