"use client";
import type { Expense, ExpenseFields } from "@line-work/expense/domain";
import Link from "next/link";
import { useEffect, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { authHeaders } from "../../shared/browser/supabase-session";

type View = Omit<Expense, "owner" | "scope" | "imageId">;
const labels = {
  merchant: "商家",
  amount: "金額",
  currency: "幣別",
  date: "日期",
  invoiceNumber: "憑證號碼（選填）",
};

export default function ExpensePanel({ liffId }: { liffId: string }) {
  const [expense, setExpense] = useState<View>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [id, setId] = useState("");

  // 確認完成後自動關閉 LIFF 視窗返回原生聊天室
  useEffect(() => {
    if (expense?.status !== "confirmed" || !liffClient.inClient()) return;
    const timer = setTimeout(() => liffClient.close(), 1500);
    return () => clearTimeout(timer);
  }, [expense?.status]);

  /**
   * 載入特定支出資料（攜帶 LIFF Bearer Token）
   */
  async function load(access: string, expenseId: string) {
    const result = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}`, {
      headers: await authHeaders(access),
      cache: "no-store",
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error);
    setExpense(data);
  }

  /**
   * 初始化 LIFF 客戶端環境並核驗登入
   */
  async function initialize() {
    setExpense(undefined);
    setToken("");
    try {
      if (!liffId) throw new Error("操作頁尚未設定。");
      const access = await liffClient.session(liffId);
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

  /**
   * 派發支出狀態機指令 (辨識、儲存、確認、取消)
   */
  async function command(type: "recognize" | "save" | "confirm" | "cancel") {
    if (!expense || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fields = Object.fromEntries(
        [...Object.keys(labels), "payment"].map((key) => [
          key,
          expense[key as keyof ExpenseFields],
        ]),
      );
      const result = await fetch(`/api/expenses/${id}`, {
        method: "POST",
        headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          revision: expense.revision,
          ...(["save", "confirm"].includes(type) ? { fields } : {}),
        }),
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      setExpense(data);
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
      <p className="eyebrow">工作助手 · 支出</p>
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
      ) : expense?.status === "pending" ? (
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
            {Object.entries(labels).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={label}
                  required={key !== "invoiceNumber"}
                  maxLength={120}
                  inputMode={key === "amount" ? "decimal" : undefined}
                  type={key === "date" ? "date" : "text"}
                  value={expense[key as keyof ExpenseFields]}
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
                onChange={(e) =>
                  setExpense({ ...expense, payment: e.target.value as ExpenseFields["payment"] })
                }
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
