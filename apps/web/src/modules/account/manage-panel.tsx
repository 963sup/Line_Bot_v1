"use client";
import type {
  UserManagementQuery,
  UserManagementView,
  UserStatusReceipt,
} from "@line-work/account/contracts/user-management";
import type { UserStatusCommand } from "@line-work/account/domain/user";
import { parseUserStatusCommand } from "@line-work/account/domain/user";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading, PageState } from "../../shared/ui/page-layout";

const key = "member-management-pending";
type Pending = { owner: string; command: UserStatusCommand };
const labels = { active: "使用中", paused: "已暫停", suspended: "已停權" };
const eventLabels: Record<string, string> = {
  registered: "註冊會員",
  membership_resumed: "恢復會員",
  membership_deactivated: "暫停會員",
  supabase_linked: "關聯 Google",
  daily_checkin: "每日簽到",
  suspended: "停權",
  suspension_lifted: "解除停權",
};
const date = (at: number) => new Date(at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
export default function UserManagement({ liffId }: { liffId: string }) {
  const [data, setData] = useState<UserManagementView | null>(null);
  const [query, setQuery] = useState<UserManagementQuery>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [receipt, setReceipt] = useState<UserStatusReceipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  function clear() {
    sequence.current++;
    setData(null);
    setPending(null);
    setReceipt(null);
    setError("");
    setBusy(false);
  }
  async function read(token: string, filter: UserManagementQuery) {
    const response = await fetch(`/api/membership/manage?${new URLSearchParams(filter)}`, {
      headers: { "x-line-token": token },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "會員資料暫不可用。");
    return result as UserManagementView;
  }
  async function load(
    filter: UserManagementQuery = {},
    completed?: { owner: string; receipt: UserStatusReceipt },
  ) {
    const ticket = ++sequence.current;
    setBusy(true);
    setReceipt(null);
    setData(null);
    setPending(null);
    setError("");
    setQuery(filter);
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入。");
      const result = await read(token, filter);
      if (ticket !== sequence.current) return;
      if ((await liffClient.session(liffId)) !== token)
        throw new Error("LINE 身分已變更，請重新讀取。");
      if (ticket !== sequence.current) return;
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const old = JSON.parse(saved) as Pending;
        if (old.owner === result.actorId)
          setPending({ owner: old.owner, command: parseUserStatusCommand(old.command) });
        else sessionStorage.removeItem(key);
      }
      setData(result);
      if (completed?.owner === result.actorId) setReceipt(completed.receipt);
    } catch (failure) {
      if (ticket === sequence.current) {
        setReceipt(null);
        setError(failure instanceof Error ? failure.message : "讀取失敗。");
      }
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  async function send(operation: Pending) {
    const ticket = ++sequence.current;
    setBusy(true);
    setError("");
    setReceipt(null);
    let submitted = false;
    try {
      const command = parseUserStatusCommand(operation.command);
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入。");
      const fresh = await read(token, { id: command.target });
      if (ticket !== sequence.current) return;
      if (fresh.actorId !== operation.owner || (await liffClient.session(liffId)) !== token) {
        sessionStorage.removeItem(key);
        setPending(null);
        throw new Error("LINE 身分已變更，請重新讀取後確認。");
      }
      if (!fresh.canSuspend) throw new Error("你沒有停權或解除權限。");
      if (ticket !== sequence.current) return;
      sessionStorage.setItem(key, JSON.stringify({ owner: operation.owner, command }));
      setPending({ owner: operation.owner, command });
      submitted = true;
      const response = await fetch("/api/membership/manage", {
        method: "POST",
        headers: { "x-line-token": token, "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = await response.json();
      if (ticket !== sequence.current) return;
      if ((await liffClient.session(liffId)) !== token) {
        clear();
        return;
      }
      if (ticket !== sequence.current) return;
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          sessionStorage.removeItem(key);
          setPending(null);
          setData(null);
        }
        throw new Error(result.error ?? "結果未確認，請重試原操作。");
      }
      if (
        result.id !== command.target ||
        result.requestId !== command.requestId ||
        result.version !== command.expectedVersion + 1 ||
        !["active", "paused", "suspended"].includes(result.status) ||
        (command.action === "suspend"
          ? result.status !== "suspended"
          : result.status === "suspended") ||
        !Number.isFinite(result.at)
      )
        throw new Error("回執不完整，請重試原操作。");
      sessionStorage.removeItem(key);
      setPending(null);
      await load({ id: command.target }, { owner: operation.owner, receipt: result });
    } catch (failure) {
      if (ticket === sequence.current) {
        setError(failure instanceof Error ? failure.message : "操作失敗。");
        if (!submitted) setData(null);
      }
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") clear();
    else void load();
  });
  const onPageHide = useEffectEvent(() => {
    clear();
  });
  useEffect(() => {
    const visibility = () => onVisibilityChange();
    const pagehide = () => onPageHide();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => {
      sequence.current++;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
    };
  }, []);
  const detail = data?.detail;
  const blocked = busy || Boolean(pending);
  return (
    <>
      <PageHeading
        title="會員管理"
        back="/admin"
        description="查詢會員資格，記錄停權與解除原因。"
      />
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      <button type="button" disabled={busy} onClick={() => void load(query)}>
        重新讀取
      </button>
      {Object.keys(query).length > 0 && (
        <button type="button" disabled={busy} onClick={() => void load()}>
          清除查詢條件
        </button>
      )}
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {receipt && (
        <p role="status">
          已完成：{labels[receipt.status]} · {date(receipt.at)} · 操作編號 {receipt.requestId}
        </p>
      )}
      {pending && (
        <section>
          <h2>上次操作待確認</h2>
          <p>
            會員 {pending.command.target}；
            {pending.command.action === "suspend" ? "停權" : "解除停權"}。刷新不會自動送出。
          </p>
          <button type="button" disabled={busy} onClick={() => void send(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {!data && !busy && !error && (
        <PageState title="請完成 LINE 登入">將確認你的會員管理資格。</PageState>
      )}
      {data && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const id = String(form.get("id") ?? "").trim();
              const status = String(form.get("status") ?? "");
              setReceipt(null);
              void load(
                id ? { id } : status ? { status: status as UserManagementQuery["status"] } : {},
              );
            }}
          >
            <fieldset disabled={blocked}>
              <legend>查詢會員</legend>
              <label>
                會員編號
                <input
                  name="id"
                  defaultValue={query.id ?? ""}
                  maxLength={128}
                  placeholder="完整會員編號"
                />
              </label>
              <label>
                會員狀態
                <select name="status" defaultValue={query.status ?? ""}>
                  <option value="">全部</option>
                  <option value="active">使用中</option>
                  <option value="paused">已暫停</option>
                  <option value="suspended">已停權</option>
                </select>
              </label>
              <p>輸入完整會員編號時直接查詢該會員。</p>
              <button type="submit">查詢</button>
            </fieldset>
          </form>
          {!detail && (
            <>
              <h2>會員列表</h2>
              {data.users.length === 0 && <p>沒有符合條件的會員。</p>}
              {data.users.map((m) => (
                <section key={m.id}>
                  <h3>{m.id}</h3>
                  <p>
                    {labels[m.status]} · 註冊於 {date(m.createdAt)}
                  </p>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      setReceipt(null);
                      void load({ id: m.id });
                    }}
                  >
                    查看 {m.id}
                  </button>
                </section>
              ))}
              {data.next && (
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => void load({ ...query, after: data.next! })}
                >
                  下一頁
                </button>
              )}
            </>
          )}
          {detail && (
            <section>
              <h2>會員明細</h2>
              <p>會員編號：{detail.user.id}</p>
              <p>目前狀態：{labels[detail.user.status]}</p>
              <p>註冊時間：{date(detail.user.createdAt)}</p>
              <p>Google：{detail.user.googleLinked ? "已關聯" : "未關聯"}</p>
              <h3>待處理工作</h3>
              <p>未結束出勤：{detail.openAttendance.length} 筆</p>
              {detail.openAttendance.map((id) => (
                <p key={id}>{id}</p>
              ))}
              <p>未完成 Issue：{detail.unfinishedIssueCount} 筆（最多列 20 筆）</p>
              {detail.unfinishedIssues.map((id) => (
                <p key={id}>{id}</p>
              ))}
              {data.canSuspend && data.actorId !== detail.user.id ? (
                <form
                  key={`${detail.user.id}:${detail.user.version}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    if (form.get("confirmed") !== "on") return;
                    void send({
                      owner: data.actorId,
                      command: {
                        action: detail.user.status === "suspended" ? "unsuspend" : "suspend",
                        target: detail.user.id,
                        expectedVersion: detail.user.version,
                        requestId: crypto.randomUUID(),
                        reason: String(form.get("reason") ?? ""),
                      },
                    });
                  }}
                >
                  <fieldset disabled={blocked}>
                    <legend>{detail.user.status === "suspended" ? "解除停權" : "停權會員"}</legend>
                    <p>
                      {detail.user.status === "suspended"
                        ? `解除後為「${labels[detail.user.restoreStatus]}」。`
                        : "停權後無法使用會員功能；既有出勤與 Issue 需交由責任人處理。"}
                    </p>
                    <label>
                      操作原因
                      <textarea name="reason" required maxLength={500} />
                    </label>
                    <label>
                      <input type="checkbox" name="confirmed" required />
                      我已確認會員編號與影響。
                    </label>
                    <button type="submit">
                      {detail.user.status === "suspended" ? "確認解除停權" : "確認停權"}
                    </button>
                  </fieldset>
                </form>
              ) : (
                <p>
                  {data.actorId === detail.user.id
                    ? "不能操作自己的管理停權狀態。"
                    : "目前只有會員查詢權限。"}
                </p>
              )}
              <h3>最近管理操作</h3>
              {detail.operations.length === 0 && <p>尚無管理操作紀錄。</p>}
              {detail.operations.map((op) => (
                <p key={op.version}>
                  {date(op.at)} · {op.action === "suspend" ? "停權" : "解除停權"} · {op.reason} ·
                  操作者 {op.actor}
                </p>
              ))}
              {detail.moreOperations && <p>僅列最近 20 筆，仍有較早紀錄。</p>}
              <details>
                <summary>最近會員事件</summary>
                {detail.events.map((event, i) => (
                  <p key={`${event.at}:${i}`}>
                    {date(event.at)} · {eventLabels[event.type] ?? "會員資料異動"}
                  </p>
                ))}
                {detail.moreEvents && <p>僅列最近 20 筆，仍有較早紀錄。</p>}
              </details>
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  setReceipt(null);
                  void load();
                }}
              >
                返回會員列表
              </button>
            </section>
          )}
        </>
      )}
    </>
  );
}
