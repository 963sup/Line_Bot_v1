"use client";
import type { AttendanceSnapshot } from "@line_bot_v1/attendance/contracts/clock";
import {
  parseAttendanceResult,
  parseAttendanceSnapshot,
} from "@line_bot_v1/attendance/contracts/dto/attendance-client";
import {
  attendanceDuration,
  attendanceTime,
} from "@line_bot_v1/attendance/contracts/dto/attendance-presentation";
import {
  parseAttendanceSupplementInbox,
  parseAttendanceSupplementReceipt,
} from "@line_bot_v1/attendance/contracts/dto/attendance-supplement";
import type { AttendanceInput } from "@line_bot_v1/attendance/contracts/input/attendance-command";
import type {
  AttendanceSupplementReview,
  AttendanceSupplementSubmission,
} from "@line_bot_v1/attendance/contracts/input/attendance-supplement";
import { parseAttendanceSupplementReview } from "@line_bot_v1/attendance/contracts/input/attendance-supplement";
import type { AttendanceSupplementInbox } from "@line_bot_v1/attendance/contracts/supplements";
import { attendanceActionForMenuState } from "@line_bot_v1/attendance/domain/policies/attendance-view";
import {
  type AttendanceOperation,
  attendanceOperation,
  attendanceOperationLabel,
  isAttendanceOperation,
} from "@line_bot_v1/attendance/domain/value-objects/attendance-action";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { authHeaders } from "../../shared/browser/supabase-session";
import { PageHeading } from "../../shared/ui/page-layout";
import { locateAttendance } from "./location";

type Pending = {
  operation: AttendanceOperation;
  body: AttendanceInput;
};

const taipeiDateTime = (value: number) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const taipeiTimestamp = (value: string) => Date.parse(`${value}:00+08:00`);
const supplementStatus = {
  PENDING: "等待 Repository ADMIN 審核",
  APPROVED: "已核准並加入出勤紀錄",
  REJECTED: "已拒絕",
} as const;

const message = (e: unknown) => (e instanceof Error ? e.message : "出勤結果尚未確認，請稍後再試。");
const pendingReviewStorageKey = (viewerId: string) =>
  `attendance:supplement-reviews:v1:${encodeURIComponent(viewerId)}`;

function readPendingReviews(viewerId: string): Record<string, AttendanceSupplementReview> {
  const key = pendingReviewStorageKey(viewerId);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error("Invalid stored review commands");
    return Object.fromEntries(
      value.map((command) => {
        const parsed = parseAttendanceSupplementReview(command);
        return [parsed.supplementId, parsed];
      }),
    );
  } catch {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Storage can be disabled by the browser; there is nothing safe to recover.
    }
    return {};
  }
}

function writePendingReview(viewerId: string, command: AttendanceSupplementReview, remove = false) {
  const key = pendingReviewStorageKey(viewerId);
  const pending = readPendingReviews(viewerId);
  if (remove) delete pending[command.supplementId];
  else pending[command.supplementId] = command;
  if (Object.keys(pending).length)
    window.sessionStorage.setItem(key, JSON.stringify(Object.values(pending)));
  else window.sessionStorage.removeItem(key);
}

export default function AttendancePanel({ liffId }: { liffId: string }) {
  const [data, setData] = useState<AttendanceSnapshot | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [intent, setIntent] = useState<AttendanceOperation | null>(null);
  const [supplements, setSupplements] = useState<AttendanceSupplementInbox | null>(null);
  const [supplementLoading, setSupplementLoading] = useState(false);
  const [supplementBusy, setSupplementBusy] = useState(false);
  const [supplementError, setSupplementError] = useState("");
  const [supplementNotice, setSupplementNotice] = useState("");
  const [supplementPending, setSupplementPending] = useState<AttendanceSupplementSubmission | null>(
    null,
  );
  const [pendingReviews, setPendingReviews] = useState<Record<string, AttendanceSupplementReview>>(
    {},
  );
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [supplementKind, setSupplementKind] = useState<"new-session" | "close-session">(
    "new-session",
  );
  const [repositoryId, setRepositoryId] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [supplementReason, setSupplementReason] = useState("");
  const generation = useRef(0);
  const supplementGeneration = useRef(0);
  const locked = useRef(false);

  useEffect(
    () => () => {
      generation.current++;
      supplementGeneration.current++;
    },
    [],
  );

  function clearPrivate() {
    supplementGeneration.current++;
    setData(null);
    setToken("");
    setPending(null);
    setNotice("");
    setSupplements(null);
    setSupplementLoading(false);
    setSupplementError("");
    setSupplementNotice("");
    setSupplementPending(null);
    setPendingReviews({});
    setSupplementBusy(false);
  }

  async function read(access: string) {
    const response = await fetch("/api/attendance", {
      headers: await authHeaders(access),
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(value.error || "無法取得出勤紀錄。");
      if (response.status === 401 || response.status === 403) error.name = "AttendanceAccessError";
      throw error;
    }
    return parseAttendanceSnapshot(value);
  }

  async function readSupplements(access: string) {
    const response = await fetch("/api/attendance/supplements", {
      headers: await authHeaders(access),
      cache: "no-store",
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(value.error || "無法取得補登申請。");
      if (response.status === 401 || response.status === 403) error.name = "AttendanceAccessError";
      throw error;
    }
    return parseAttendanceSupplementInbox(value);
  }

  async function loadSupplements(access: string, ticket?: number) {
    setSupplementLoading(true);
    setSupplementError("");
    try {
      const value = await readSupplements(access);
      if (ticket === undefined || ticket === supplementGeneration.current) {
        setSupplements(value);
        setPendingReviews(readPendingReviews(value.viewerId));
      }
    } catch (e) {
      if (ticket === undefined || ticket === supplementGeneration.current) {
        if (e instanceof Error && e.name === "AttendanceAccessError") clearPrivate();
        setSupplementError(message(e));
      }
    } finally {
      if (ticket === undefined || ticket === supplementGeneration.current)
        setSupplementLoading(false);
    }
  }

  async function initialize() {
    if (locked.current) return;
    const ticket = ++generation.current;
    clearPrivate();
    setLoading(true);
    setError("");
    try {
      const access = await liffClient.session(liffId);
      if (!access || ticket !== generation.current) return;
      const value = await read(access);
      if (ticket !== generation.current) return;
      setToken(access);
      setData(value);
      void loadSupplements(access, supplementGeneration.current);
      const operation = new URL(window.location.href).searchParams.get("operation");
      if (isAttendanceOperation(operation)) setIntent(operation);
    } catch (e) {
      if (ticket === generation.current) setError(message(e));
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }

  async function refresh() {
    if (!token || locked.current) return;
    const ticket = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const access = await liffClient.session(liffId);
      if (ticket !== generation.current) return;
      if (!access) {
        clearPrivate();
        return;
      }
      if (access !== token) {
        clearPrivate();
        setToken(access);
      }
      const supplementTicket = supplementGeneration.current;
      const value = await read(access);
      if (ticket === generation.current) {
        setData(value);
        void loadSupplements(access, supplementTicket);
      }
    } catch (e) {
      if (ticket === generation.current) {
        setData(null);
        if (e instanceof Error && e.name === "AttendanceAccessError") clearPrivate();
        setError(message(e));
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible" && !pending) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  });

  async function send(request: Pending, ticket: number) {
    setPending(request);
    setNotice("正在記錄…");
    const response = await fetch(`/api/attendance/${request.operation}`, {
      method: "POST",
      headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
    });
    const value = await response.json().catch(() => ({}));
    if (ticket !== generation.current) return;
    if (!response.ok) {
      if (response.status < 500) setPending(null);
      if (response.status === 401 || response.status === 403) clearPrivate();
      if (response.status === 409) setData(null);
      throw new Error(value.error || "結果尚未確認，請重送同一筆。");
    }
    const result = parseAttendanceResult(value);
    const latest = result.replayed ? await read(token) : result;
    if (ticket !== generation.current) return;
    setData(latest);
    setPending(null);
    setIntent(null);
    setNotice(`${attendanceOperationLabel(request.operation)}已記錄。`);
  }

  async function operate(operation: AttendanceOperation, retry?: Pending) {
    if (locked.current || !token || (!retry && (!data?.sites.length || pending || loading))) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice(retry ? "正在確認原操作…" : "正在取得本次定位…");
    const ticket = ++generation.current;
    try {
      const request =
        retry ??
        ({
          operation,
          body: {
            requestId: crypto.randomUUID(),
            expectedVersion: data!.version,
            location: await locateAttendance(),
          },
        } satisfies Pending);
      if (ticket === generation.current) await send(request, ticket);
    } catch (e) {
      if (ticket === generation.current) {
        setNotice("");
        if (e instanceof Error && e.name === "AttendanceAccessError") clearPrivate();
        setError(message(e));
      }
    } finally {
      locked.current = false;
      if (ticket === generation.current) setBusy(false);
    }
  }

  async function sendSupplement(command: AttendanceSupplementSubmission) {
    if (!token || supplementBusy) return;
    const identityTicket = supplementGeneration.current;
    setSupplementPending(command);
    setSupplementBusy(true);
    setSupplementError("");
    setSupplementNotice("正在送交 Repository ADMIN 審核…");
    try {
      const response = await fetch("/api/attendance/supplements", {
        method: "POST",
        headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const value = await response.json().catch(() => ({}));
      if (identityTicket !== supplementGeneration.current) return;
      if (!response.ok) {
        if (response.status < 500) setSupplementPending(null);
        if (response.status === 401) clearPrivate();
        throw new Error(value.error || "補登結果尚未確認，請重送同一筆申請。");
      }
      parseAttendanceSupplementReceipt(value);
      setSupplementPending(null);
      setStartedAt("");
      setEndedAt("");
      setSupplementReason("");
      setSupplementNotice("補登申請已送出；核准前不會改變出勤紀錄。");
      await loadSupplements(token, identityTicket);
    } catch (e) {
      if (identityTicket !== supplementGeneration.current) return;
      setSupplementNotice("");
      setSupplementError(message(e));
    } finally {
      if (identityTicket === supplementGeneration.current) setSupplementBusy(false);
    }
  }

  function submitSupplement() {
    if (!data || !token || supplementBusy || supplementPending) return;
    const end = taipeiTimestamp(endedAt);
    if (!Number.isSafeInteger(end)) {
      setSupplementError("請填寫有效的下班日期與時間。");
      return;
    }
    const reason = supplementReason.trim();
    if (!reason || reason.length > 500) {
      setSupplementError("請填寫 1 至 500 字的補登原因。");
      return;
    }
    const requestId = crypto.randomUUID();
    if (supplementKind === "close-session") {
      if (!active) {
        setSupplementError("目前沒有可提出補登下班時間的出勤紀錄。");
        return;
      }
      void sendSupplement({
        requestId,
        kind: "close-session",
        sessionId: active.id,
        endedAt: end,
        reason,
      });
      return;
    }
    const start = taipeiTimestamp(startedAt);
    const eligibleSites = data.sites.filter((candidate) => candidate.repositoryId !== null);
    const site =
      eligibleSites.find((candidate) => candidate.id === repositoryId) ?? eligibleSites[0];
    if (!Number.isSafeInteger(start) || start >= end) {
      setSupplementError("請填寫有效時段，且下班時間必須晚於上班時間。");
      return;
    }
    if (!site?.repositoryId) {
      setSupplementError("目前沒有可提出補登的 Repository 地址。");
      return;
    }
    void sendSupplement({
      requestId,
      kind: "new-session",
      repositoryId: site.repositoryId,
      startedAt: start,
      endedAt: end,
      reason,
    });
  }

  async function sendReview(command: AttendanceSupplementReview) {
    if (!token || supplementBusy || !supplements?.viewerId) return;
    const identityTicket = supplementGeneration.current;
    const viewerId = supplements.viewerId;
    try {
      writePendingReview(viewerId, command);
    } catch {
      setSupplementError("無法保存審核重試資料；請檢查此分頁的儲存空間後再送出。");
      return;
    }
    setPendingReviews((current) => ({ ...current, [command.supplementId]: command }));
    setSupplementBusy(true);
    setSupplementError("");
    try {
      const response = await fetch("/api/attendance/supplements/review", {
        method: "POST",
        headers: { ...(await authHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const value = await response.json().catch(() => ({}));
      if (identityTicket !== supplementGeneration.current) return;
      if (!response.ok) {
        if (response.status < 500) {
          writePendingReview(viewerId, command, true);
          setPendingReviews((current) => {
            const next = { ...current };
            delete next[command.supplementId];
            return next;
          });
        }
        if (response.status === 401) clearPrivate();
        throw new Error(value.error || "審核結果尚未確認，請重新整理或重送同一筆。");
      }
      parseAttendanceSupplementReceipt(value);
      writePendingReview(viewerId, command, true);
      setPendingReviews((current) => {
        const next = { ...current };
        delete next[command.supplementId];
        return next;
      });
      setSupplementNotice(command.decision === "approve" ? "補登已核准。" : "補登已拒絕。");
      await loadSupplements(token, identityTicket);
    } catch (e) {
      if (identityTicket !== supplementGeneration.current) return;
      setSupplementError(message(e));
    } finally {
      if (identityTicket === supplementGeneration.current) setSupplementBusy(false);
    }
  }

  function reviewSupplement(
    supplementId: string,
    expectedVersion: number,
    decision: "approve" | "reject",
  ) {
    if (pendingReviews[supplementId]) return;
    const reason = reviewReasons[supplementId]?.trim();
    if (decision === "reject" && !reason) {
      setSupplementError("拒絕補登時請填寫原因。");
      return;
    }
    void sendReview({
      commandId: crypto.randomUUID(),
      supplementId,
      expectedVersion,
      decision,
      ...(reason ? { reason } : {}),
    });
  }

  const active = data?.attendance.active;
  const operation = data
    ? attendanceOperation(attendanceActionForMenuState(data.attendance.menuState))
    : null;
  const stale = !!intent && !!operation && intent !== operation;
  const eligibleSites = data?.sites.filter((site) => site.repositoryId !== null) ?? [];
  const selectedRepository =
    eligibleSites.find((site) => site.id === repositoryId) ?? eligibleSites[0];

  return (
    <>
      <MiniAppRuntime liffId={liffId} onReady={initialize} onWait={() => setLoading(false)} />
      <PageHeading
        title="出勤"
        description="先確認目前狀態，再執行上班或下班；按下操作後才會取得定位。"
      />
      {loading && <p role="status">正在確認出勤紀錄…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!token && !loading && <button onClick={() => void initialize()}>重新確認 LINE 登入</button>}
      {pending && (
        <section aria-label="待確認操作">
          <p>「{attendanceOperationLabel(pending.operation)}」結果尚未確認，請重送同一筆。</p>
          <button disabled={busy} onClick={() => void operate(pending.operation, pending)}>
            重送同一筆
          </button>
        </section>
      )}
      {data && operation && (
        <>
          <section className="attendance-current" aria-labelledby="attendance-status">
            <h2 id="attendance-status">{active ? "上班中" : "尚未上班"}</h2>
            {active && <p>上班時間：{attendanceTime(active.startedAt)}</p>}
            {stale && intent && (
              <p role="status">
                你開啟的是「{attendanceOperationLabel(intent)}
                」，目前狀態已不同。請確認下方狀態，再選擇操作。
              </p>
            )}
            {data.sites.length ? (
              <p>
                按下按鈕才取得定位。可打卡地點：
                {data.sites.map((s) => `${s.name}（${s.radius} 公尺）`).join("、")}。
              </p>
            ) : (
              <p>尚未加入已設定地址的儲存庫，請聯絡儲存庫管理者。</p>
            )}
            <button
              className="attendance-primary"
              disabled={busy || loading || !!pending || !data.sites.length || stale}
              onClick={() => void operate(operation)}
            >
              {attendanceOperationLabel(operation)}
            </button>
            {stale && (
              <button
                className="secondary"
                disabled={busy || !!pending}
                onClick={() => setIntent(null)}
              >
                確認目前狀態
              </button>
            )}
          </section>
          <section aria-labelledby="attendance-records">
            <h2 id="attendance-records">最近出勤紀錄</h2>
            <p>最近 30 天與未結束紀錄 · 計算至 {attendanceTime(data.attendance.computedAt)}</p>
            <p>記錄經過時間未扣除休息；時段分類不等於法定加班或薪資工時。</p>
            {data.attendance.records.length === 0 ? (
              <p>尚無出勤紀錄。</p>
            ) : (
              [...data.attendance.records].reverse().map((r) => (
                <article className="attendance-record" key={r.id}>
                  <h3>
                    {r.day}
                    {r.summary.crossesMidnight ? " · 跨日" : ""}
                    {r.endedAt === null ? " · 進行中" : ""}
                  </h3>
                  <p>
                    上班 {attendanceTime(r.startedAt)}
                    <br />
                    下班 {r.endedAt === null ? "尚未結束" : attendanceTime(r.endedAt)}
                  </p>
                  <p>
                    {r.summary.provisional ? "暫計" : "記錄經過"}{" "}
                    {attendanceDuration(r.summary.elapsedMs)}
                  </p>
                  <dl>
                    <dt>08:00 前</dt>
                    <dd>{attendanceDuration(r.summary.beforeMs)}</dd>
                    <dt>08:00–17:00</dt>
                    <dd>{attendanceDuration(r.summary.scheduledMs)}</dd>
                    <dt>17:00 後</dt>
                    <dd>{attendanceDuration(r.summary.afterMs)}</dd>
                  </dl>
                  {r.summary.crossesMidnight && (
                    <details>
                      <summary>每日明細</summary>
                      {r.summary.days.map((day) => (
                        <p key={day.day}>
                          {day.day} · {attendanceDuration(day.elapsedMs)}（08:00 前{" "}
                          {attendanceDuration(day.beforeMs)}／08:00–17:00{" "}
                          {attendanceDuration(day.scheduledMs)}／17:00 後{" "}
                          {attendanceDuration(day.afterMs)}）
                        </p>
                      ))}
                    </details>
                  )}
                </article>
              ))
            )}
          </section>
          <section aria-labelledby="attendance-supplements">
            <h2 id="attendance-supplements">補登申請</h2>
            <p>
              你只能提出補登；核准前不會新增或變更出勤紀錄。核准後會保留申請內容與審核人，補登不會產生打卡獎勵或薪資計算。
            </p>
            <p>
              申請時間以台灣時間填寫；地址是送出申請時的 Repository 地址快照，不代表系統取得了當時的
              GPS 證明。
            </p>
            {supplementError && <p role="alert">{supplementError}</p>}
            {supplementNotice && <p role="status">{supplementNotice}</p>}
            {supplementPending && (
              <div role="status">
                <p>申請結果尚未確認，請以相同請求編號重送，避免建立第二筆申請。</p>
                <button
                  className="secondary"
                  disabled={supplementBusy}
                  onClick={() => void sendSupplement(supplementPending)}
                >
                  重送同一筆補登申請
                </button>
              </div>
            )}
            <form
              className="form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                submitSupplement();
              }}
            >
              <fieldset>
                <legend>申請類型</legend>
                <label>
                  <input
                    type="radio"
                    name="supplement-kind"
                    checked={supplementKind === "new-session"}
                    onChange={() => setSupplementKind("new-session")}
                    disabled={supplementBusy || !!supplementPending}
                  />
                  補一段完整出勤時段
                </label>
                <label>
                  <input
                    type="radio"
                    name="supplement-kind"
                    checked={supplementKind === "close-session"}
                    onChange={() => setSupplementKind("close-session")}
                    disabled={supplementBusy || !!supplementPending || !active}
                  />
                  為目前未結束的出勤申請補下班時間
                </label>
              </fieldset>
              {supplementKind === "new-session" ? (
                <>
                  <label>
                    Repository 地址
                    <select
                      value={selectedRepository?.id ?? ""}
                      onChange={(event) => setRepositoryId(event.target.value)}
                      required
                      disabled={supplementBusy || !!supplementPending || !eligibleSites.length}
                    >
                      {eligibleSites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    補登上班時間（台灣時間）
                    <input
                      type="datetime-local"
                      step={60}
                      value={startedAt}
                      onChange={(event) => setStartedAt(event.target.value)}
                      required
                      disabled={supplementBusy || !!supplementPending}
                    />
                  </label>
                </>
              ) : (
                <p>
                  原上班時間 {active ? attendanceTime(active.startedAt) : "不可用"}
                  ；申請只提出下班時間，不會回改原紀錄。
                </p>
              )}
              <label>
                {supplementKind === "new-session"
                  ? "補登下班時間（台灣時間）"
                  : "申請下班時間（台灣時間）"}
                <input
                  type="datetime-local"
                  step={60}
                  value={endedAt}
                  onChange={(event) => setEndedAt(event.target.value)}
                  required
                  disabled={supplementBusy || !!supplementPending}
                />
              </label>
              <label>
                補登原因
                <textarea
                  value={supplementReason}
                  onChange={(event) => setSupplementReason(event.target.value)}
                  maxLength={500}
                  required
                  disabled={supplementBusy || !!supplementPending}
                />
              </label>
              <button
                className="attendance-primary"
                type="submit"
                disabled={
                  supplementBusy ||
                  !!supplementPending ||
                  loading ||
                  !token ||
                  supplementLoading ||
                  (supplementKind === "new-session" && !eligibleSites.length)
                }
              >
                送出補登申請
              </button>
            </form>
            {supplementLoading && <p role="status">正在讀取補登申請…</p>}
            <section aria-labelledby="my-attendance-supplements">
              <h3 id="my-attendance-supplements">我的補登申請</h3>
              {supplements?.mine.length ? (
                [...supplements.mine].reverse().map((item) => (
                  <article className="attendance-record" key={item.id}>
                    <h4>{supplementStatus[item.status]}</h4>
                    <p>
                      {item.site.name} · {item.kind === "new-session" ? "完整時段" : "補下班時間"}
                    </p>
                    <p>
                      {item.startedAt === null
                        ? "原上班時間保留不變"
                        : `上班 ${taipeiDateTime(item.startedAt)}`}
                      <br />
                      下班 {taipeiDateTime(item.endedAt)}
                    </p>
                    <p>申請原因：{item.reason}</p>
                    {item.reviewReason && <p>審核說明：{item.reviewReason}</p>}
                  </article>
                ))
              ) : (
                <p>{supplementLoading ? "" : "尚無補登申請。"}</p>
              )}
            </section>
            <section aria-labelledby="review-attendance-supplements">
              <h3 id="review-attendance-supplements">待我審核</h3>
              <p>
                只有該 Repository 當下有效的 ADMIN User 可以審核；Organization admin
                身分本身不授權。
              </p>
              {supplements?.review.length ? (
                supplements.review.map((item) => (
                  <article className="attendance-record" key={item.id}>
                    <h4>
                      {item.site.name} ·{" "}
                      {item.kind === "new-session" ? "完整時段補登" : "補下班時間"}
                    </h4>
                    <p>申請者 User ID：{item.userId}</p>
                    <p>
                      {item.startedAt === null
                        ? "原上班時間保留不變"
                        : `上班 ${taipeiDateTime(item.startedAt)}`}
                      <br />
                      下班 {taipeiDateTime(item.endedAt)}
                    </p>
                    <p>申請原因：{item.reason}</p>
                    <label>
                      審核說明（拒絕時必填）
                      <textarea
                        value={reviewReasons[item.id] ?? ""}
                        onChange={(event) =>
                          setReviewReasons((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        maxLength={500}
                        disabled={supplementBusy || !!pendingReviews[item.id]}
                      />
                    </label>
                    {pendingReviews[item.id] ? (
                      <button
                        className="secondary"
                        disabled={supplementBusy}
                        onClick={() => void sendReview(pendingReviews[item.id]!)}
                      >
                        重送上次審核結果
                      </button>
                    ) : (
                      <div className="utility-actions">
                        <button
                          className="attendance-primary"
                          disabled={supplementBusy}
                          onClick={() => reviewSupplement(item.id, item.version, "approve")}
                        >
                          核准並加入出勤紀錄
                        </button>
                        <button
                          className="secondary"
                          disabled={supplementBusy || !reviewReasons[item.id]?.trim()}
                          onClick={() => reviewSupplement(item.id, item.version, "reject")}
                        >
                          拒絕申請
                        </button>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <p>{supplementLoading ? "" : "目前沒有可審核的補登申請。"}</p>
              )}
              {Object.entries(pendingReviews)
                .filter(
                  ([supplementId]) => !supplements?.review.some((item) => item.id === supplementId),
                )
                .map(([supplementId, command]) => (
                  <div role="status" key={supplementId}>
                    <p>上次審核結果尚未確認；申請已離開待審清單時，重送會讀回同一個審核回執。</p>
                    <button
                      className="secondary"
                      disabled={supplementBusy}
                      onClick={() => void sendReview(command)}
                    >
                      重送上次{command.decision === "approve" ? "核准" : "拒絕"}操作
                    </button>
                  </div>
                ))}
            </section>
          </section>
        </>
      )}
      <div className="utility-actions">
        <button
          className="secondary"
          disabled={loading || busy || !token}
          onClick={() => void refresh()}
        >
          重新整理狀態
        </button>
        <Link className="secondary-link" href="/home">
          返回工作台
        </Link>
      </div>
    </>
  );
}
