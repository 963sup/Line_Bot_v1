"use client";
import type { ExpenseApiView } from "@line_bot_v1/expense/contracts/dto/expense-api-view";
import type { ExpenseFields } from "@line_bot_v1/expense/domain/aggregates/expense";
import { isRecord } from "@line_bot_v1/platform/validation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";

type View = ExpenseApiView;
type ReceiptReadingView = {
  merchant: string | null;
  amount: string | null;
  currency: string | null;
  date: string | null;
  invoiceNumber: string | null;
};

const labels = {
  merchant: "商家",
  amount: "金額",
  currency: "幣別",
  date: "日期",
  invoiceNumber: "憑證號碼（選填）",
};
const fieldKeys: readonly (keyof Omit<ExpenseFields, "payment">)[] = [
  "merchant",
  "amount",
  "currency",
  "date",
  "invoiceNumber",
];

function readExpense(value: unknown): ExpenseApiView {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.number !== "number" ||
    typeof value.merchant !== "string" ||
    typeof value.amount !== "string" ||
    typeof value.currency !== "string" ||
    typeof value.date !== "string" ||
    typeof value.invoiceNumber !== "string" ||
    (value.payment !== "" &&
      value.payment !== "advance" &&
      value.payment !== "company" &&
      value.payment !== "unpaid") ||
    (value.status !== "pending" &&
      value.status !== "draft" &&
      value.status !== "confirmed" &&
      value.status !== "cancelled") ||
    typeof value.revision !== "number" ||
    typeof value.createdAt !== "number"
  )
    throw new Error("支出回應格式不完整。");
  return {
    id: value.id,
    number: value.number,
    merchant: value.merchant,
    amount: value.amount,
    currency: value.currency,
    date: value.date,
    invoiceNumber: value.invoiceNumber,
    payment: value.payment,
    status: value.status,
    revision: value.revision,
    createdAt: value.createdAt,
  };
}

function readReceipt(value: unknown): ReceiptReadingView {
  if (!isRecord(value)) throw new Error("辨識回應格式不完整。");
  const nullable = (item: unknown) => item === null || typeof item === "string";
  if (
    !nullable(value.merchant) ||
    !nullable(value.amount) ||
    !nullable(value.currency) ||
    !nullable(value.date) ||
    !nullable(value.invoiceNumber)
  )
    throw new Error("辨識回應格式不完整。");
  return {
    merchant: value.merchant,
    amount: value.amount,
    currency: value.currency,
    date: value.date,
    invoiceNumber: value.invoiceNumber,
  };
}

export default function ExpensePanel({ liffId }: { liffId: string }) {
  const [expense, setExpense] = useState<View>();
  const [hasRecognition, setHasRecognition] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [id, setId] = useState("");

  useEffect(() => {
    if (expense?.status !== "confirmed" || !liffClient.inClient()) return;
    const timer = setTimeout(() => liffClient.close(), 1500);
    return () => clearTimeout(timer);
  }, [expense?.status]);

  async function load(access: string, expenseId: string) {
    const result = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
      headers: { "X-App-Session-Generation": access },
      cache: "no-store",
    });
    const data: unknown = await result.json();
    if (!result.ok)
      throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "載入失敗。");
    setHasRecognition(false);
    setExpense(readExpense(data));
  }

  async function initialize() {
    setExpense(undefined);
    setHasRecognition(false);
    setToken("");
    try {
      if (!liffId) throw new Error("操作頁尚未設定。");
      const access = await liffClient.ensureSession(liffId);
      if (!access) return;
      const expenseId = new URL(window.location.href).searchParams.get("expense");
      if (!expenseId) throw new Error("請從群組中的「處理」按鈕開啟支出。");
      setToken(access);
      setId(expenseId);
      await load(access, expenseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function command(type: "recognize" | "save" | "confirm" | "cancel") {
    if (!expense || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fields = Object.fromEntries(
        ([...fieldKeys, "payment"] satisfies readonly (keyof ExpenseApiView)[]).map((key) => [
          key,
          expense[key],
        ]),
      );
      const result = await fetch(`/api/expenses/${id}`, {
        method: "POST",
        headers: { "X-App-Session-Generation": token, "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          revision: expense.revision,
          ...(["save", "confirm"].includes(type) ? { fields } : {}),
        }),
      });
      const data: unknown = await result.json();
      if (!result.ok)
        throw new Error(
          isRecord(data) && typeof data.error === "string" ? data.error : "操作失敗。",
        );

      if (type === "recognize") {
        if (!isRecord(data)) throw new Error("辨識回應格式不完整。");
        const reading = readReceipt(data.reading);
        setExpense({
          ...expense,
          merchant: reading.merchant ?? "",
          amount: reading.amount ?? "",
          currency: reading.currency ?? "",
          date: reading.date ?? "",
          invoiceNumber: reading.invoiceNumber ?? "",
        });
        setHasRecognition(true);
        return;
      }

      setHasRecognition(false);
      setExpense(readExpense(data));
      if (type === "save") setNotice("已儲存修改。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗，請重試。");
    } finally {
      setBusy(false);
    }
  }

  const finished = expense && ["confirmed", "cancelled"].includes(expense.status);

  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={initialize} onWait={() => setBusy(false)} />
      <p className="eyebrow">Line_Bot_v1 · 支出</p>
      <h1>{expense ? `支出 #${expense.number}` : "處理支出"}</h1>
      {busy && <p role="status">{expense ? "處理中，請稍候…" : "正在驗證 LINE 身分…"}</p>}
      {error && (
        <div role="alert" className="expense-error">
          {error}
          <Link href="/settings">前往帳號設定</Link>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (token && id) await load(token, id);
                else await initialize();
              } catch (e) {
                setError(e instanceof Error ? e.message : "載入失敗");
              } finally {
                setBusy(false);
              }
            }}
          >
            重新載入
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {finished ? (
        <section className="expense-success">
          <h2>{expense.status === "confirmed" ? "✓ 已確認" : "已取消"}</h2>
          <p>
            {expense.status === "confirmed" ? "資料已保存，尚未正式入帳。" : "這筆支出已取消。"}
          </p>
          <button
            onClick={() => {
              if (liffClient.inClient()) liffClient.close();
              else setNotice("可以關閉此視窗。");
            }}
          >
            完成，返回聊天
          </button>
        </section>
      ) : expense?.status === "pending" && !hasRecognition ? (
        <section>
          <p>辨識後，在這裡核對收據與補齊資料。</p>
          <p className="expense-hint">
            圖片將送至 Gemini 免費 API，內容可能用於改善產品。請使用非敏感測試憑證。
          </p>
          <button disabled={busy} onClick={() => command("recognize")}>
            辨識收據
          </button>
          <button className="secondary" disabled={busy} onClick={() => command("cancel")}>
            取消支出
          </button>
        </section>
      ) : expense ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void command("confirm");
          }}
        >
          <p className="expense-hint">核對辨識結果；空白欄位需要補充。</p>
          <fieldset disabled={busy}>
            {fieldKeys.map((key) => (
              <label key={key}>
                {labels[key]}
                <input
                  aria-label={labels[key]}
                  required={key !== "invoiceNumber"}
                  maxLength={120}
                  inputMode={key === "amount" ? "decimal" : undefined}
                  type={key === "date" ? "date" : "text"}
                  value={expense[key]}
                  onChange={(e) => setExpense({ ...expense, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              付款方式
              <select
                required
                aria-label="付款方式"
                value={expense.payment}
                onChange={(e) => {
                  const payment = e.target.value;
                  if (
                    payment === "" ||
                    payment === "advance" ||
                    payment === "company" ||
                    payment === "unpaid"
                  )
                    setExpense({ ...expense, payment });
                }}
              >
                <option value="">請選擇</option>
                <option value="advance">我先墊付</option>
                <option value="company">公司支付</option>
                <option value="unpaid">尚未付款</option>
              </select>
            </label>
            <button type="submit">確認支出</button>
            <button type="button" className="secondary" onClick={() => command("save")}>
              儲存修改
            </button>
            <button type="button" className="secondary" onClick={() => command("cancel")}>
              取消支出
            </button>
          </fieldset>
        </form>
      ) : null}
      <p className="expense-hint">測試版 · 資料保存在會員系統；一般修改與確認不發送群組訊息。</p>
    </>
  );
}
